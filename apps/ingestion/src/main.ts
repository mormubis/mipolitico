import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import {
  EMPTY,
  Observable,
  ReplaySubject,
  Subject,
  catchError,
  filter,
  lastValueFrom,
  map,
  merge,
  mergeMap,
  retry,
  share,
  tap,
} from 'rxjs';

import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as declarationDetailFinder } from './finders/declaration-detail.ts';
import { finder as declarationFinder } from './finders/declaration.ts';
import { finder as deputyDetailFinder } from './finders/deputy-detail.ts';
import { finder as deputyFinder } from './finders/deputy.ts';
import { finder as initiativeFinder } from './finders/initiative.ts';
import { finder as interventionDetailFinder } from './finders/intervention-detail.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as bureauProcessor } from './processors/bureau.ts';
import { processor as declarationDetailProcessor } from './processors/declaration-detail.ts';
import { processor as declarationProcessor } from './processors/declaration.ts';
import { processor as governmentMembersProcessor } from './processors/government-members.ts';
import { processor as interventionProcessor } from './processors/intervention.ts';
import { processor as partyProcessor } from './processors/party.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as declarationDetailRetriever } from './retrievers/declaration-detail.ts';
import { retriever as declarationRetriever } from './retrievers/declaration.ts';
import { retriever as deputyDetailRetriever } from './retrievers/deputy-detail.ts';
import { retriever as deputyRetriever } from './retrievers/deputy.ts';
import { retriever as initiativeRetriever } from './retrievers/initiative.ts';
import { retriever as interventionDetailRetriever } from './retrievers/intervention-detail.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import { buildSideInput } from './side-inputs.ts';
import {
  persistDeputies,
  persistGovernmentMembers,
  persistInitiatives,
  persistInterestDeclarations,
  persistInterventions,
  persistOrganMembers,
  persistParties,
  persistPersonDetail,
  persistVotes,
} from './sinks/index.ts';
import { normalizeSpanishName } from './utils.ts';

import type { PersistResult } from './sinks/index.ts';
import type {
  CommonOptions,
  Finder,
  ProcessorContext,
  Retriever,
  Sink,
  TaggedData,
  TaggedOutput,
  TaggedUrl,
} from './types.ts';
import type { OperatorFunction } from 'rxjs';

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

interface SourceEntry<T> {
  name: string;
  finder: Finder;
  retriever: Retriever<T>;
  urlFilter?: (url: string) => boolean;
  /** Source names that must fully complete before this source's finder starts. */
  after?: string[];
}

interface PipelineEntry {
  sources: string[];
  processor?: OperatorFunction<unknown, TaggedOutput>;
  sinks: Record<string, Sink<unknown, unknown>>;
}

// ---------------------------------------------------------------------------
// Watermark helpers
// ---------------------------------------------------------------------------

async function buildVotingFilter(): Promise<(url: string) => boolean> {
  const existingKeys = await getExistingSessionKeys();
  return (url: string) => {
    const match = /Leg(\d+)\/Sesion(\d+)/.exec(url);
    if (!match) return true;
    const leg = match[1];
    const sess = match[2];
    if (!leg || !sess) return true;
    const key = `${leg}-${parseInt(sess, 10).toString()}`;
    return !existingKeys.has(key);
  };
}

// ---------------------------------------------------------------------------
// Registry builders
// ---------------------------------------------------------------------------

function buildSources(
  votingFilter: (url: string) => boolean,
): SourceEntry<unknown>[] {
  return [
    { name: 'deputy', finder: deputyFinder, retriever: deputyRetriever },
    {
      name: 'deputy-detail',
      finder: deputyDetailFinder,
      retriever: deputyDetailRetriever,
    },
    {
      name: 'voting',
      finder: votingFinder,
      retriever: votingRetriever,
      urlFilter: votingFilter,
    },
    { name: 'bureau', finder: bureauFinder, retriever: bureauRetriever },
    {
      name: 'intervention',
      finder: interventionFinder,
      retriever: interventionRetriever,
    },
    {
      name: 'intervention-detail',
      finder: interventionDetailFinder,
      retriever: interventionDetailRetriever,
      // Must run after 'intervention' completes so the processor's scan
      // accumulator has all bulk metadata rows before detail records arrive.
      after: ['intervention'],
    },
    {
      name: 'initiative',
      finder: initiativeFinder,
      retriever: initiativeRetriever,
    },
    {
      name: 'declaration',
      finder: declarationFinder,
      retriever: declarationRetriever,
    },
    {
      name: 'declaration-detail',
      finder: declarationDetailFinder,
      retriever: declarationDetailRetriever,
    },
  ];
}

// ---------------------------------------------------------------------------
// Source alias map — maps CLI --source values to one or more SourceEntry names
// ---------------------------------------------------------------------------

// null means "activate all sources"
const SOURCE_ALIASES: Record<string, string[] | null> = {
  // deputies: full deputy profile (metadata + detail)
  deputies: ['deputy', 'deputy-detail'],
  // parties: subset of deputies needed to extract party data
  parties: ['deputy', 'deputy-detail'],
  // interventions: full intervention pipeline (bulk metadata + detail HTML)
  interventions: ['intervention', 'intervention-detail'],
  // declarations: interest declaration PDFs per deputy
  declarations: ['declaration', 'declaration-detail'],
  all: null,
};

// Maps SourceEntry names to ScraperMetadata keys for success/failure tracking
const SCRAPER_TYPE_MAP: Record<string, string> = {
  'deputy': 'deputies',
  'deputy-detail': 'personDetail',
  'voting': 'voting',
  'bureau': 'bureau',
  'intervention': 'interventions',
  'intervention-detail': 'interventions',
  'initiative': 'initiatives',
  'declaration': 'interestDeclarations',
  'declaration-detail': 'interestDeclarationsDetail',
};

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

function printSummary(
  results: {
    label: string;
    status: 'success' | 'error';
    result?: PersistResult;
    error?: string;
  }[],
): void {
  const divider = '─'.repeat(72);
  console.log(`\n${divider}`);
  console.log('  INGESTION SUMMARY');
  console.log(divider);

  if (results.length === 0) {
    console.log('  No pipelines produced results.');
    console.log(divider);
    return;
  }

  for (const entry of results) {
    if (entry.status === 'error') {
      console.log(`  ❌ ${entry.label}`);
      console.log(`     Error: ${entry.error ?? 'unknown'}`);
    } else if (entry.result) {
      const r = entry.result;
      const batches = r.batches > 0 ? ` · ${String(r.batches)} batches` : '';
      const sessions =
        r.totalSessions !== undefined
          ? ` · ${String(r.totalSessions)} sessions`
          : '';
      const invalid =
        (r.totalValidationSkipped ?? 0) > 0
          ? ` · ${String(r.totalValidationSkipped)} invalid`
          : '';
      console.log(
        `  ✅ ${entry.label.padEnd(35)} ` +
          `${String(r.totalSuccess).padStart(6)} stored` +
          ` · ${String(r.totalSkipped).padStart(4)} skipped` +
          batches +
          sessions +
          invalid,
      );
    }
  }

  const successful = results.filter((r) => r.status === 'success');
  const totalStored = successful.reduce(
    (sum, r) => sum + (r.result?.totalSuccess ?? 0),
    0,
  );
  const totalSkipped = successful.reduce(
    (sum, r) => sum + (r.result?.totalSkipped ?? 0),
    0,
  );
  const totalInvalid = successful.reduce(
    (sum, r) => sum + (r.result?.totalValidationSkipped ?? 0),
    0,
  );
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(
    `  Total: ${String(totalStored)} stored · ${String(totalSkipped)} skipped` +
      (totalInvalid > 0 ? ` · ${String(totalInvalid)} invalid` : '') +
      (errors > 0 ? ` · ${String(errors)} pipeline(s) failed` : ''),
  );
  console.log(`${divider}\n`);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function runAll(
  source?: string,
  validationMode: 'strict' | 'soft' = 'soft',
): Promise<void> {
  // Resolve alias to actual source names (undefined = all sources)
  const resolvedSources: string[] | undefined = (() => {
    if (!source) return undefined;
    if (source in SOURCE_ALIASES) {
      const alias = SOURCE_ALIASES[source];
      return alias ?? undefined; // null alias = all sources
    }
    return [source];
  })();

  const votingFilter =
    !resolvedSources || resolvedSources.includes('voting')
      ? await buildVotingFilter()
      : () => true;

  const SOURCES = buildSources(votingFilter);

  // Filter registry when --source is provided
  const activeSources = resolvedSources
    ? SOURCES.filter((s) => resolvedSources.includes(s.name))
    : SOURCES;

  const activeSourceNames = new Set(activeSources.map((s) => s.name));

  if (activeSources.length === 0) {
    const validSources = [
      ...SOURCES.map((s) => s.name),
      ...Object.keys(SOURCE_ALIASES),
    ];
    console.error(
      `[main] Unknown source: "${source ?? ''}". Valid: ${validSources.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const browser = await launch({ headless: true });
  try {
    const options: CommonOptions = { browser, fetch };
    const retrieverOptions = { ...options, validationMode };

    // Completion gates — each source that others depend on gets a Subject.
    // When its retriever stream ends, it completes the subject to unblock dependents.
    const completionGates = new Map<string, Subject<void>>();
    for (const entry of activeSources) {
      const isDependency = activeSources.some((s) =>
        s.after?.includes(entry.name),
      );
      if (isDependency) completionGates.set(entry.name, new Subject<void>());
    }

    // Build per-source data streams first (needed to wire completion gates).
    // Each source stream processes its URLs through the retriever.
    const sourceData$ = new Map<string, Observable<TaggedData>>();
    for (const entry of activeSources) {
      // Finder URLs, optionally delayed until `after` sources complete
      const rawFinder$ = entry.finder(options).pipe(
        filter((url) => (entry.urlFilter ? entry.urlFilter(url) : true)),
        map((url): TaggedUrl => ({ source: entry.name, url })),
      );

      const finder$: Observable<TaggedUrl> =
        entry.after && entry.after.length > 0
          ? new Observable<TaggedUrl>((subscriber) => {
              // Wait for all `after` sources to signal completion, then subscribe to finder
              const deps = (entry.after ?? [])
                .map((dep) => completionGates.get(dep))
                .filter((g): g is Subject<void> => g != null);

              if (deps.length === 0) {
                rawFinder$.subscribe(subscriber);
                return;
              }

              let completed = 0;
              const checkAndStart = () => {
                completed++;
                if (completed === deps.length) {
                  rawFinder$.subscribe(subscriber);
                }
              };

              for (const dep of deps) {
                dep.subscribe({ complete: checkAndStart });
              }
            })
          : rawFinder$;

      const stream$ = finder$.pipe(
        mergeMap(({ url }) =>
          entry
            .retriever({ url, sourceName: entry.name, ...retrieverOptions })
            .pipe(
              retry({ delay: 15 * 1000, count: 1 }),
              map((data): TaggedData => ({ source: entry.name, data })),
              catchError((err: unknown) => {
                console.warn(
                  `[${entry.name}] Skipping URL after retry: ${url} — ${(err as Error).message}`,
                );
                return EMPTY;
              }),
            ),
        ),
        tap({
          complete: () => {
            const gate = completionGates.get(entry.name);
            if (gate) {
              gate.next();
              gate.complete();
            }
          },
        }),
        share(),
      );

      sourceData$.set(entry.name, stream$);
    }

    // Build side inputs from source streams
    const deputySource$ = sourceData$.get('deputy');

    const personMap$ = deputySource$
      ? buildSideInput(
          deputySource$.pipe(
            map(({ data }) => data as { name: string; personId: string }),
          ),
          (p) => normalizeSpanishName(p.name),
          (p) => p.personId,
        )
      : buildSideInput(
          EMPTY as Observable<{ name: string; personId: string }>,
          (p) => normalizeSpanishName(p.name),
          (p) => p.personId,
        );

    const deputyMap$ = deputySource$
      ? buildSideInput(
          deputySource$.pipe(
            map(({ data }) => data as { name: string; deputyId: string }),
          ),
          (p) => normalizeSpanishName(p.name),
          (p) => p.deputyId,
        )
      : buildSideInput(
          EMPTY as Observable<{ name: string; deputyId: string }>,
          (p) => normalizeSpanishName(p.name),
          (p) => p.deputyId,
        );

    // Government member side input — built from government-members pipeline output
    const govMemberRecords$ = new ReplaySubject<{
      id: string;
      personId?: string;
      role: string;
    }>();
    const governmentMemberMap$ = buildSideInput(
      govMemberRecords$.asObservable(),
      (gm) => `${gm.personId ?? ''}::${gm.role.trim().toLowerCase()}`,
      (gm) => gm.id,
    );

    const ctx: ProcessorContext = {
      personMap$,
      deputyMap$,
      governmentMemberMap$,
    };

    const PIPELINES: PipelineEntry[] = [
      { sources: ['deputy'], sinks: { deputy: persistDeputies() } },
      {
        sources: ['deputy-detail'],
        sinks: { deputyDetail: persistPersonDetail() },
      },
      {
        // partyProcessor uses reduce() — emits after all 'deputy' records complete.
        // Party names come from the static PARTY_NAMES map in config/party-parents.ts
        // since the profile page does not expose full party names.
        sources: ['deputy'],
        processor: partyProcessor(ctx) as OperatorFunction<
          unknown,
          TaggedOutput
        >,
        sinks: { party: persistParties() },
      },
      { sources: ['voting'], sinks: { vote: persistVotes() } },
      {
        sources: ['bureau'],
        processor: bureauProcessor(ctx) as OperatorFunction<
          unknown,
          TaggedOutput
        >,
        sinks: { organMember: persistOrganMembers() },
      },
      {
        sources: ['intervention', 'intervention-detail'],
        processor: interventionProcessor(ctx),
        sinks: { intervention: persistInterventions() },
      },
      {
        // Extracts government members from intervention bulk JSON.
        // Runs alongside the interventions pipeline using the same 'intervention' source.
        sources: ['intervention'],
        processor: governmentMembersProcessor(ctx) as OperatorFunction<
          unknown,
          TaggedOutput
        >,
        sinks: { governmentMember: persistGovernmentMembers() },
      },
      { sources: ['initiative'], sinks: { initiative: persistInitiatives() } },
      {
        sources: ['declaration'],
        processor: declarationProcessor(ctx) as OperatorFunction<
          unknown,
          TaggedOutput
        >,
        sinks: { declaration: persistInterestDeclarations() },
      },
      {
        sources: ['declaration-detail'],
        processor: declarationDetailProcessor(ctx) as OperatorFunction<
          unknown,
          TaggedOutput
        >,
        sinks: { declaration: persistInterestDeclarations() },
      },
    ];

    // Only activate pipelines where ALL required sources are active.
    // Pipelines whose sources are only partially active are skipped with a log.
    const activePipelines = PIPELINES.filter((p) => {
      const allActive = p.sources.every((s) => activeSourceNames.has(s));
      if (!allActive && resolvedSources) {
        const missing = p.sources.filter((s) => !activeSourceNames.has(s));
        console.log(
          `[main] Skipping pipeline [${p.sources.join(', ')}] — missing sources: ${missing.join(', ')}`,
        );
      }
      return allActive;
    });

    // Step 2: Build shared tagged data pool using ordered source streams
    const data$ = merge(
      ...([...sourceData$.values()] as [
        Observable<TaggedData>,
        ...Observable<TaggedData>[],
      ]),
    ).pipe(share());

    // Step 3: Build pipeline streams from registry
    const results: {
      label: string;
      status: 'success' | 'error';
      result?: PersistResult;
      error?: string;
    }[] = [];

    const pipelineStreams = activePipelines.flatMap((entry) => {
      const filtered$ = data$.pipe(
        filter(({ source }) => entry.sources.includes(source)),
        map(({ data }) => data),
      );

      const defaultTag = Object.keys(entry.sinks)[0] ?? '';
      const processed$ = entry.processor
        ? filtered$.pipe(entry.processor)
        : filtered$.pipe(
            map((data) => ({ tag: defaultTag, data }) as TaggedOutput),
          );

      const shared$ = processed$.pipe(share());
      const sourceLabel = `[${entry.sources.join('+')}]`;

      return Object.entries(entry.sinks).map(([sinkTag, sink]) => {
        const label = `${sourceLabel} → ${sinkTag}`;

        let sinkInput$ = shared$.pipe(
          filter((output: TaggedOutput) => output.tag === sinkTag),
          map((output: TaggedOutput) => output.data),
        );

        // Tap government member records into side input subject
        if (sinkTag === 'governmentMember') {
          sinkInput$ = sinkInput$.pipe(
            tap((record) => {
              const gm = record as {
                id: string;
                personId?: string;
                role: string;
              };
              govMemberRecords$.next(gm);
            }),
            tap({
              complete: () => {
                govMemberRecords$.complete();
              },
            }),
          );
        }

        return sinkInput$.pipe(
          sink as OperatorFunction<unknown, unknown>,
          tap((result) => {
            results.push({
              label,
              status: 'success',
              result: result as PersistResult,
            });
          }),
          catchError((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[main] Pipeline ${label} failed: ${message}`);
            results.push({ label, status: 'error', error: message });
            return EMPTY;
          }),
        );
      });
    });

    if (pipelineStreams.length === 0) {
      console.warn('[main] No active pipelines for the given source(s)');
      return;
    }

    // Step 4: Run all pipeline streams concurrently
    await lastValueFrom(
      merge(
        ...(pipelineStreams as [Observable<unknown>, ...Observable<unknown>[]]),
      ).pipe(
        tap({
          complete: () => {
            printSummary(results);
          },
        }),
      ),
    );

    // Record success for each unique scraper type that ran
    const scraperTypes = [
      ...new Set(
        activeSources
          .map((s) => SCRAPER_TYPE_MAP[s.name])
          .filter((t): t is string => t !== undefined),
      ),
    ];
    await Promise.all(
      scraperTypes.map((t) =>
        updateScraperMetadata(
          t as Parameters<typeof updateScraperMetadata>[0],
          true,
        ),
      ),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const scraperTypes = [
      ...new Set(
        activeSources
          .map((s) => SCRAPER_TYPE_MAP[s.name])
          .filter((t): t is string => t !== undefined),
      ),
    ];
    await Promise.all(
      scraperTypes.map((t) =>
        updateScraperMetadata(
          t as Parameters<typeof updateScraperMetadata>[0],
          false,
          message,
        ).catch(console.error),
      ),
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const sourceArg = process.argv
  .find((arg) => arg.startsWith('--source='))
  ?.replace('--source=', '');

const validationArg = process.argv.includes('--validation=strict')
  ? 'strict'
  : 'soft';

void runAll(sourceArg, validationArg).catch((error: unknown) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});

export { runAll };

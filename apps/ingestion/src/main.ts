import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import {
  EMPTY,
  Observable,
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
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { finder as interestDeclarationsDetailFinder } from './finders/interest-declarations-detail.ts';
import { finder as interestDeclarationsFinder } from './finders/interest-declarations.ts';
import { finder as interventionDetailFinder } from './finders/intervention-detail.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personDetailFinder } from './finders/person-detail.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as bureauProcessor } from './processors/bureau.ts';
import { processor as interestDeclarationsDetailProcessor } from './processors/interest-declarations-detail.ts';
import { processor as interestDeclarationsProcessor } from './processors/interest-declarations.ts';
import { processor as interventionProcessor } from './processors/intervention.ts';
import { processor as partyProcessor } from './processors/party.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
import { retriever as interestDeclarationsDetailRetriever } from './retrievers/interest-declarations-detail.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interest-declarations.ts';
import { retriever as interventionDetailRetriever } from './retrievers/intervention-detail.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personDetailRetriever } from './retrievers/person-detail.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistInterventions,
  persistOrganMembers,
  persistParties,
  persistPersonDetail,
  persistVotes,
} from './sinks/index.ts';

import type {
  CommonOptions,
  Finder,
  Retriever,
  Sink,
  TaggedData,
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

interface PipelineEntry<T, U> {
  sources: string[];
  processor?: OperatorFunction<T, U>;
  sink: Sink<U, unknown>;
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
    { name: 'person', finder: personFinder, retriever: personRetriever },
    {
      name: 'person-detail',
      finder: personDetailFinder,
      retriever: personDetailRetriever,
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
      name: 'initiatives',
      finder: initiativesFinder,
      retriever: initiativesRetriever,
    },
    {
      name: 'interest-declarations',
      finder: interestDeclarationsFinder,
      retriever: interestDeclarationsRetriever,
    },
    {
      name: 'interest-declarations-detail',
      finder: interestDeclarationsDetailFinder,
      retriever: interestDeclarationsDetailRetriever,
    },
  ];
}

const PIPELINES: PipelineEntry<unknown, unknown>[] = [
  { sources: ['person'], sink: persistDeputies() },
  { sources: ['person-detail'], sink: persistPersonDetail() },
  {
    // partyProcessor uses reduce() — emits after all 'person' records complete.
    // Party names come from the static PARTY_NAMES map in config/party-parents.ts
    // since the profile page does not expose full party names.
    sources: ['person'],
    processor: partyProcessor as OperatorFunction<unknown, unknown>,
    sink: persistParties(),
  },
  { sources: ['voting'], sink: persistVotes() },
  {
    sources: ['bureau'],
    processor: bureauProcessor as OperatorFunction<unknown, unknown>,
    sink: persistOrganMembers(),
  },
  {
    sources: ['intervention', 'intervention-detail'],
    processor: interventionProcessor as OperatorFunction<unknown, unknown>,
    sink: persistInterventions(),
  },
  { sources: ['initiatives'], sink: persistInitiatives() },
  {
    sources: ['interest-declarations'],
    processor: interestDeclarationsProcessor as OperatorFunction<
      unknown,
      unknown
    >,
    sink: persistInterestDeclarations(),
  },
  {
    sources: ['interest-declarations-detail'],
    processor: interestDeclarationsDetailProcessor as OperatorFunction<
      unknown,
      unknown
    >,
    sink: persistInterestDeclarations(),
  },
];

// ---------------------------------------------------------------------------
// Source alias map — maps CLI --source values to one or more SourceEntry names
// ---------------------------------------------------------------------------

// null means "activate all sources"
const SOURCE_ALIASES: Record<string, string[] | null> = {
  // deputies: full deputy profile (metadata + detail)
  deputies: ['person', 'person-detail'],
  // parties: subset of deputies needed to extract party data
  parties: ['person', 'person-detail'],
  // interventions: full intervention pipeline (bulk metadata + detail HTML)
  interventions: ['intervention', 'intervention-detail'],
  // declarations: interest declaration PDFs per deputy
  declarations: ['interest-declarations', 'interest-declarations-detail'],
  all: null,
};

// Maps SourceEntry names to ScraperMetadata keys for success/failure tracking
const SCRAPER_TYPE_MAP: Record<string, string> = {
  'person': 'deputies',
  'person-detail': 'personDetail',
  'voting': 'voting',
  'bureau': 'bureau',
  'intervention': 'interventions',
  'intervention-detail': 'interventions',
  'initiatives': 'initiatives',
  'interest-declarations': 'interestDeclarations',
  'interest-declarations-detail': 'interestDeclarationsDetail',
};

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
          entry.retriever({ url, ...retrieverOptions }).pipe(
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

    // Step 2: Build shared tagged data pool using ordered source streams
    const data$ = merge(
      ...([...sourceData$.values()] as [
        Observable<TaggedData>,
        ...Observable<TaggedData>[],
      ]),
    ).pipe(share());

    // Step 3: Build pipeline streams from registry
    const pipelineStreams = activePipelines.map((entry) => {
      const filtered$ = data$.pipe(
        filter(({ source }) => entry.sources.includes(source)),
        map(({ data }) => data),
      );
      const processed$ = entry.processor
        ? filtered$.pipe(entry.processor)
        : filtered$;
      return processed$.pipe(entry.sink);
    });

    if (pipelineStreams.length === 0) {
      console.warn('[main] No active pipelines for the given source(s)');
      return;
    }

    // Step 4: Run all pipeline streams concurrently
    await lastValueFrom(
      merge(
        ...(pipelineStreams as [Observable<unknown>, ...Observable<unknown>[]]),
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

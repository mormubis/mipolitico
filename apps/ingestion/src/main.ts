import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import {
  filter,
  lastValueFrom,
  map,
  merge,
  mergeMap,
  retry,
  share,
} from 'rxjs';

import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { finder as interestDeclarationsFinder } from './finders/interest-declarations.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personDetailFinder } from './finders/person-detail.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as interestDeclarationsProcessor } from './processors/interest-declarations.ts';
import { processor as partyProcessor } from './processors/party.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interest-declarations.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personDetailRetriever } from './retrievers/person-detail.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistParties,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';

import type {
  CommonOptions,
  Finder,
  Retriever,
  TaggedData,
  TaggedUrl,
} from './types.ts';
import type { Observable, OperatorFunction } from 'rxjs';

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

interface SourceEntry<T> {
  name: string;
  finder: Finder;
  retriever: Retriever<T>;
  urlFilter?: (url: string) => boolean;
}

interface PipelineEntry<T, U> {
  sources: string[];
  processor?: OperatorFunction<T, U>;
  sink: OperatorFunction<U, unknown>;
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
// Orchestrator
// ---------------------------------------------------------------------------

async function runAll(source?: string): Promise<void> {
  const votingFilter = await buildVotingFilter();

  const SOURCES: SourceEntry<unknown>[] = [
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
      name: 'initiatives',
      finder: initiativesFinder,
      retriever: initiativesRetriever,
    },
    {
      name: 'interest-declarations',
      finder: interestDeclarationsFinder,
      retriever: interestDeclarationsRetriever,
    },
  ];

  const PIPELINES: PipelineEntry<unknown, unknown>[] = [
    { sources: ['person'], sink: persistDeputies() },
    {
      sources: ['person', 'person-detail'],
      processor: partyProcessor as OperatorFunction<unknown, unknown>,
      sink: persistParties(),
    },
    { sources: ['voting'], sink: persistVotes() },
    { sources: ['bureau'], sink: persistOrganMembers() },
    { sources: ['intervention'], sink: persistSpeeches() },
    { sources: ['initiatives'], sink: persistInitiatives() },
    {
      sources: ['interest-declarations'],
      processor: interestDeclarationsProcessor as OperatorFunction<
        unknown,
        unknown
      >,
      sink: persistInterestDeclarations(),
    },
  ];

  // Filter registry when --source is provided
  const activeSources = source
    ? SOURCES.filter((s) => s.name === source)
    : SOURCES;

  const activePipelines = source
    ? PIPELINES.filter((p) => p.sources.includes(source))
    : PIPELINES;

  const activeSourceNames = new Set(activeSources.map((s) => s.name));

  if (activeSources.length === 0) {
    console.error(
      `[main] Unknown source: "${source ?? ''}". Valid: ${SOURCES.map((s) => s.name).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const browser = await launch({ headless: true });
  try {
    const options: CommonOptions = { browser, fetch };

    // Step 1: Build shared tagged URL pool
    const urls$ = merge(
      ...(activeSources.map((entry) =>
        entry.finder(options).pipe(
          filter((url) => (entry.urlFilter ? entry.urlFilter(url) : true)),
          map((url): TaggedUrl => ({ source: entry.name, url })),
        ),
      ) as [Observable<TaggedUrl>, ...Observable<TaggedUrl>[]]),
    ).pipe(share());

    // Step 2: Build shared tagged data pool
    const data$ = merge(
      ...(activeSources.map((entry) =>
        urls$.pipe(
          filter(({ source }) => source === entry.name),
          mergeMap(({ url }) =>
            entry.retriever({ url, ...options }).pipe(
              retry({ delay: 15 * 1000, count: 1 }),
              map((data): TaggedData => ({ source: entry.name, data })),
            ),
          ),
        ),
      ) as [Observable<TaggedData>, ...Observable<TaggedData>[]]),
    ).pipe(share());

    // Step 3: Build pipeline streams from registry
    const pipelineStreams = activePipelines
      .filter((p) => p.sources.every((s) => activeSourceNames.has(s)))
      .map((entry) => {
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

    await updateScraperMetadata('deputies', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('deputies', false, message).catch(
      console.error,
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

void runAll(sourceArg).catch((error: unknown) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});

export { runAll };

import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import { filter, lastValueFrom, merge, mergeMap, retry, share } from 'rxjs';

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

import type { CommonOptions, Finder, Retriever } from './types.ts';
import type { OperatorFunction } from 'rxjs';

type Branch<T> = [Retriever<T>, ...OperatorFunction<T, unknown>[]];

interface PipelineEntry {
  name: string;
  finder: Finder;
  branches: Branch<unknown>[];
  urlFilter?: (url: string) => boolean;
}

async function runPipeline(
  entry: PipelineEntry,
  options: CommonOptions,
): Promise<void> {
  const urlFilter = entry.urlFilter;
  const base$ = entry.finder(options);
  const urls$ = urlFilter
    ? base$.pipe(filter(urlFilter), share())
    : base$.pipe(share());

  if (entry.branches.length === 0) {
    await lastValueFrom(urls$, { defaultValue: undefined });
    return;
  }

  const branchStreams = entry.branches.map(([retriever, ...ops]) => {
    let stream: ReturnType<typeof urls$.pipe> = urls$.pipe(
      mergeMap((url: string) =>
        retriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );
    for (const op of ops) {
      stream = stream.pipe(op);
    }
    return stream;
  });

  await lastValueFrom(merge(...branchStreams));
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
// Pipeline runners
// ---------------------------------------------------------------------------

async function runPersonPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'deputies',
        finder: personFinder,
        branches: [[personRetriever, persistDeputies()]],
      },
      { browser, fetch },
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

async function runPartyPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    const options: CommonOptions = { browser, fetch };

    const personUrls$ = personFinder(options).pipe(share());
    const detailUrls$ = personDetailFinder(options).pipe(share());

    const person$ = personUrls$.pipe(
      mergeMap((url: string) =>
        personRetriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );
    const detail$ = detailUrls$.pipe(
      mergeMap((url: string) =>
        personDetailRetriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );

    await lastValueFrom(
      merge(person$, detail$).pipe(partyProcessor, persistParties()),
    );

    await updateScraperMetadata('parties', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('parties', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runVotingPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    const urlFilter = await buildVotingFilter();
    await runPipeline(
      {
        name: 'voting',
        finder: votingFinder,
        branches: [[votingRetriever, persistVotes()]],
        urlFilter,
      },
      { browser, fetch },
    );
    await updateScraperMetadata('voting', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('voting', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runBureauPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'bureau',
        finder: bureauFinder,
        branches: [[bureauRetriever, persistOrganMembers()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('bureau', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('bureau', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'intervention',
        finder: interventionFinder,
        branches: [[interventionRetriever, persistSpeeches()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('intervention', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('intervention', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInitiativesPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'initiatives',
        finder: initiativesFinder,
        branches: [[initiativesRetriever, persistInitiatives()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('initiatives', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('initiatives', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInterestDeclarationsPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'interestDeclarations',
        finder: interestDeclarationsFinder,
        branches: [
          [
            interestDeclarationsRetriever,
            interestDeclarationsProcessor,
            persistInterestDeclarations(),
          ],
        ] as Branch<unknown>[],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('interestDeclarations', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('interestDeclarations', false, message).catch(
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

const pipelines: Record<string, () => Promise<void>> = {
  bureau: runBureauPipeline,
  initiatives: runInitiativesPipeline,
  interestDeclarations: runInterestDeclarationsPipeline,
  intervention: runInterventionPipeline,
  parties: runPartyPipeline,
  person: runPersonPipeline,
  voting: runVotingPipeline,
};

async function main(): Promise<void> {
  if (!sourceArg || sourceArg === 'all') {
    console.log('[main] Running all pipelines sequentially');
    for (const [name, run] of Object.entries(pipelines)) {
      console.log(`[main] Starting ${name} pipeline`);
      await run();
      console.log(`[main] Finished ${name} pipeline`);
    }
    return;
  }

  const run = pipelines[sourceArg];
  if (!run) {
    console.error(
      `[main] Unknown source: "${sourceArg}". Valid: ${Object.keys(pipelines).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  await run();
}

void main().catch((error: unknown) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});

export {
  runBureauPipeline,
  runInitiativesPipeline,
  runInterestDeclarationsPipeline,
  runInterventionPipeline,
  runPartyPipeline,
  runPersonPipeline,
  runVotingPipeline,
};

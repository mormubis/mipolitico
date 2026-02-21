import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import { lastValueFrom, merge, retry } from 'rxjs';

import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as personDetailFinder } from './finders/personDetail.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as interestDeclarationsProcessor } from './processors/interestDeclarations.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interestDeclarations.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';

import type { Finder, Needle, Retriever } from './types.ts';
import type { Observable } from 'rxjs';

// ---------------------------------------------------------------------------
// Pipeline runner helpers
// ---------------------------------------------------------------------------

async function findAll(
  finder: Finder,
  options: Parameters<Finder>[0],
): Promise<Needle[]> {
  const result = await finder(options);

  if (Array.isArray(result)) {
    return result.map((item) =>
      typeof item === 'object' ? item : { url: item },
    );
  }

  return [{ url: result }];
}

function retrieveAll<T>(
  retriever: Retriever<T>,
  needles: Needle[],
  options: Parameters<Finder>[0],
): Observable<T> {
  return merge(
    ...needles.map((needle) =>
      retriever({ ...needle, ...options }).pipe(
        retry({ delay: 15 * 1000, count: 1 }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Person pipeline
// ---------------------------------------------------------------------------

async function runPersonPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(personFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[person] No needles found, skipping');
      await updateScraperMetadata('deputies', true);
      return;
    }

    const stream = retrieveAll(personRetriever, needles, { browser, fetch });

    await lastValueFrom(stream.pipe(persistDeputies()));

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
// Voting pipeline
// ---------------------------------------------------------------------------

async function runVotingPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const allNeedles = await findAll(votingFinder, { browser, fetch });

    // Watermark: filter out sessions already in DB
    const existingKeys = await getExistingSessionKeys();

    const newNeedles = allNeedles.filter((needle) => {
      // URL pattern: Leg{N}/Sesion{N}.json
      const match = /Leg(\d+)\/Sesion(\d+)/.exec(needle.url);
      if (!match) return true; // Keep if URL doesn't match expected pattern

      const leg = match[1];
      const sess = match[2];
      if (!leg || !sess) return true;

      const key = `${leg}-${parseInt(sess, 10).toString()}`;
      return !existingKeys.has(key);
    });

    console.log(
      `[voting] Found ${String(allNeedles.length)} sessions total, ${String(newNeedles.length)} new`,
    );

    if (newNeedles.length === 0) {
      console.log('[voting] No new sessions to process');
      await updateScraperMetadata('voting', true);
      return;
    }

    const stream = retrieveAll(votingRetriever, newNeedles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistVotes()));

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

// ---------------------------------------------------------------------------
// Bureau pipeline
// ---------------------------------------------------------------------------

async function runBureauPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(bureauFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[bureau] No needles found, skipping');
      await updateScraperMetadata('bureau', true);
      return;
    }

    const stream = retrieveAll(bureauRetriever, needles, { browser, fetch });

    await lastValueFrom(stream.pipe(persistOrganMembers()));

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

// ---------------------------------------------------------------------------
// Intervention pipeline
// ---------------------------------------------------------------------------

async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    // Finder reads lastSuccessfulRun internally (date watermark)
    const needles = await findAll(interventionFinder, { browser, fetch });

    console.log(
      `[intervention] Found ${String(needles.length)} sessions to process`,
    );

    if (needles.length === 0) {
      console.log('[intervention] No new sessions to process');
      await updateScraperMetadata('intervention', true);
      return;
    }

    const stream = retrieveAll(interventionRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistSpeeches()));

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

// ---------------------------------------------------------------------------
// Initiatives pipeline
// ---------------------------------------------------------------------------

async function runInitiativesPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(initiativesFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[initiatives] No needles found, skipping');
      await updateScraperMetadata('initiatives', true);
      return;
    }

    const stream = retrieveAll(initiativesRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistInitiatives()));

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

// ---------------------------------------------------------------------------
// Interest declarations pipeline
// ---------------------------------------------------------------------------

async function runInterestDeclarationsPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(personDetailFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[interestDeclarations] No deputies found, skipping');
      await updateScraperMetadata('interestDeclarations', true);
      return;
    }

    console.log(
      `[interestDeclarations] Processing ${String(needles.length)} deputies`,
    );

    const stream = retrieveAll(interestDeclarationsRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(
      stream.pipe(interestDeclarationsProcessor, persistInterestDeclarations()),
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
  runPersonPipeline,
  runVotingPipeline,
};

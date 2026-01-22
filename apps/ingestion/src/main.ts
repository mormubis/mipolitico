import { prisma } from '@congress/database';
import { Observable, lastValueFrom, merge, retry } from 'rxjs';

import { JOBS } from './jobs/index.ts';
import { fetch, launch } from './network/index.ts';
import { scheduler } from './scheduler.ts';
import {
  persistBureaus,
  persistDeputies,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';
import * as bureau from './sources/bureau.ts';
import * as intervention from './sources/intervention.ts';
import * as person from './sources/person.ts';
import * as voting from './sources/voting.ts';

import type { PersistResult } from './sinks/index.ts';
import type { Finder, Needle, Retriever } from './sources/types.ts';

// Parse CLI arguments
const args = process.argv.slice(2);
const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1];
const noScheduler = args.includes('--no-scheduler');
const validSources = ['person', 'voting', 'intervention', 'bureau', 'all'];

if (sourceArg && !validSources.includes(sourceArg)) {
  console.error(`Invalid source: ${sourceArg}`);
  console.error(`Valid sources: ${validSources.join(', ')}`);
  process.exit(1);
}

const runSource = sourceArg ?? 'all';

// Only launch browser if running manual scrapes
const browser =
  noScheduler || sourceArg ? await launch({ headless: true }) : null;

async function find(finder: Finder): Promise<Needle[]> {
  if (!browser) throw new Error('Browser not initialized');
  let result = await finder({ browser, fetch });

  if (!Array.isArray(result)) {
    result = [result];
  }

  return result.map((item) =>
    typeof item === 'object' ? item : { url: item },
  );
}

function retrieve<T>(
  retriever: Retriever<T>,
  needles: Needle[],
): Observable<T> {
  if (!browser) throw new Error('Browser not initialized');
  const browserInstance = browser;

  return new Observable((subscriber) => {
    try {
      merge(
        ...needles.map((needle) =>
          retriever({ ...needle, browser: browserInstance, fetch }).pipe(
            retry({ delay: 15 * 1000, count: 1 }),
          ),
        ),
      ).subscribe({
        complete: () => {
          subscriber.complete();
        },
        error: (error) => {
          subscriber.error(error);
        },
        next: (value) => {
          subscriber.next(value);
        },
      });
    } catch (cause) {
      subscriber.error(cause);
    }
  });
}

async function runPerson(): Promise<PersistResult> {
  if (!browser) throw new Error('Browser not initialized');
  console.log('\n=== Running person (deputies) scraper ===');
  const needles = await find(person.finder);
  console.log(`Found ${String(needles.length)} source(s)`);

  return lastValueFrom(
    retrieve(person.retriever, needles).pipe(
      persistDeputies({ legislature: 15 }),
    ),
  );
}

async function runVoting(): Promise<PersistResult> {
  if (!browser) throw new Error('Browser not initialized');
  console.log('\n=== Running voting scraper ===');
  const needles = await find(voting.finder);
  console.log(`Found ${String(needles.length)} source(s)`);

  return lastValueFrom(
    retrieve(voting.retriever, needles).pipe(persistVotes()),
  );
}

async function runIntervention(): Promise<PersistResult> {
  if (!browser) throw new Error('Browser not initialized');
  console.log('\n=== Running intervention (speeches) scraper ===');
  const needles = await find(intervention.finder);
  console.log(`Found ${String(needles.length)} source(s)`);

  return lastValueFrom(
    retrieve(intervention.retriever, needles).pipe(persistSpeeches()),
  );
}

async function runBureau(): Promise<PersistResult> {
  if (!browser) throw new Error('Browser not initialized');
  console.log('\n=== Running bureau scraper ===');
  const needles = await find(bureau.finder);
  console.log(`Found ${String(needles.length)} source(s)`);

  return lastValueFrom(
    retrieve(bureau.retriever, needles).pipe(persistBureaus()),
  );
}

async function runManualScrapes() {
  if (!browser) {
    console.error('Browser not initialized for manual scrapes');
    process.exit(1);
  }

  const results: PersistResult[] = [];

  try {
    if (runSource === 'all' || runSource === 'person') {
      results.push(await runPerson());
    }

    if (runSource === 'all' || runSource === 'voting') {
      results.push(await runVoting());
    }

    if (runSource === 'all' || runSource === 'intervention') {
      results.push(await runIntervention());
    }

    if (runSource === 'all' || runSource === 'bureau') {
      results.push(await runBureau());
    }

    // Print summary
    console.log('\n=== Summary ===');
    for (const result of results) {
      console.log(
        `${result.source}: ${String(result.totalSuccess)} records, ${String(result.totalSkipped)} skipped`,
      );
    }
  } catch (error) {
    console.error('Scraper failed:', error);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function startScheduler() {
  try {
    // Register enabled jobs
    const enabledJobs = JOBS.filter((job) => job.enabled);

    if (enabledJobs.length === 0) {
      console.log('[Scheduler] No enabled jobs found in registry');
      console.log('[Scheduler] Jobs will be enabled in Plan 03-02');
      console.log('[Scheduler] Scheduler ready but not started (no jobs)');
      await prisma.$disconnect();
      return;
    }

    console.log(
      `[Scheduler] Registering ${String(enabledJobs.length)} enabled job(s)...`,
    );

    for (const job of enabledJobs) {
      await scheduler.add(job);
      console.log(`[Scheduler] Registered job: ${job.name}`);
    }

    // Start the scheduler
    await scheduler.start();
    console.log('[Scheduler] Scheduler started, waiting for jobs...');

    // Keep process alive - Bree will handle scheduling
    // The process will only exit when SIGTERM/SIGINT is received
  } catch (error) {
    console.error('[Scheduler] Failed to start scheduler:', error);
    process.exitCode = 1;
    await prisma.$disconnect();
  }
}

async function main() {
  // Determine mode: scheduler vs manual scrapes
  if (noScheduler || sourceArg) {
    // Manual scrape mode (backwards compatibility)
    console.log('[Mode] Running manual scrape');
    await runManualScrapes();
  } else {
    // Scheduler mode (new default behavior)
    console.log('[Mode] Starting scheduler');
    await startScheduler();
  }
}

void main();

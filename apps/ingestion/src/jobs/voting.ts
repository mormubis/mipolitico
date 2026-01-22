import { prisma } from '@congress/database';

import { runVotingStandalone } from '../main.ts';

import type { PersistResult } from '../sinks/index.ts';

/**
 * Job result structure
 */
interface JobResult {
  success: boolean;
  result?: PersistResult;
  error?: string;
  executedAt: Date;
}

/**
 * Voting scraper job for Bree scheduler
 * Runs daily at 3:00 AM UTC (1 hour after deputies)
 * Errors are caught and logged; scheduler continues with other jobs
 */
// eslint-disable-next-line import-x/no-default-export -- Bree requires default export
export default async function votingJob(): Promise<JobResult> {
  const executedAt = new Date();

  try {
    console.log(
      '\n=== [Job: voting] Starting at',
      executedAt.toISOString(),
      '===',
    );

    const result = await runVotingStandalone();

    console.log(
      `[Job: voting] Success: ${String(result.totalSuccess)} records, ${String(result.totalSkipped)} skipped`,
    );

    return { success: true, result, executedAt };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Job: voting] Error at ${executedAt.toISOString()}:`,
      errorMessage,
    );
    return { success: false, error: errorMessage, executedAt };
  } finally {
    // Ensure database connection is closed
    await prisma.$disconnect();
  }
}

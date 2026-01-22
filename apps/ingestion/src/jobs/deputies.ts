import { prisma } from '@congress/database';

import { runPersonStandalone } from '../main.ts';

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
 * Deputies scraper job for Bree scheduler
 * Runs daily at 2:00 AM UTC
 * Errors are caught and logged; scheduler continues with other jobs
 */
// eslint-disable-next-line import-x/no-default-export -- Bree requires default export
export default async function deputiesJob(): Promise<JobResult> {
  const executedAt = new Date();

  try {
    console.log(
      '\n=== [Job: deputies] Starting at',
      executedAt.toISOString(),
      '===',
    );

    const result = await runPersonStandalone();

    console.log(
      `[Job: deputies] Success: ${String(result.totalSuccess)} records, ${String(result.totalSkipped)} skipped`,
    );

    return { success: true, result, executedAt };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Job: deputies] Error at ${executedAt.toISOString()}:`,
      errorMessage,
    );
    return { success: false, error: errorMessage, executedAt };
  } finally {
    // Ensure database connection is closed
    await prisma.$disconnect();
  }
}

import { prisma, updateScraperMetadata } from '@congress/database';

import { logScraperFailure } from '../logger.ts';
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
 * Retry configuration
 */
const MAX_ATTEMPTS = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;
const BACKOFF_DELAYS = [30_000, 60_000, 120_000]; // 30s, 60s, 120s

/**
 * Deputies scraper job with retry logic
 * Runs daily at 2:00 AM UTC
 * Retries up to 3 times within 1-hour window with exponential backoff
 */
async function deputiesJobWithRetry(
  attempt = 1,
  initialFailureTime?: Date,
): Promise<JobResult> {
  const executedAt = new Date();
  const startTime = Date.now();

  try {
    console.log(
      `\n=== [Job: deputies] Attempt ${String(attempt)}/${String(MAX_ATTEMPTS)} starting at ${executedAt.toISOString()} ===`,
    );

    const result = await runPersonStandalone();

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(
      `[Job: deputies] Success: ${String(result.totalSuccess)} records, ${String(result.totalSkipped)} skipped (${String(duration)}s)`,
    );

    // Update metadata on success
    await updateScraperMetadata('deputies', true);

    return { success: true, result, executedAt };
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorObj = error instanceof Error ? error : new Error(String(error));

    console.error(
      `[Job: deputies] Attempt ${String(attempt)} failed after ${String(duration)}s:`,
      errorMessage,
    );

    // Log failure with context
    logScraperFailure('deputies', errorObj, {
      duration,
      attemptNumber: attempt,
      recordsProcessed: '0',
    });

    // Check if we should retry
    const failureTime = initialFailureTime ?? executedAt;
    const timeSinceInitialFailure = Date.now() - failureTime.getTime();
    const shouldRetry =
      attempt < MAX_ATTEMPTS && timeSinceInitialFailure < ONE_HOUR_MS;

    if (shouldRetry) {
      const delayMs =
        BACKOFF_DELAYS[attempt - 1] ??
        BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1] ??
        30_000;
      const delaySeconds = Math.round(delayMs / 1000);

      console.log(
        `[Job: deputies] Retrying in ${String(delaySeconds)}s (attempt ${String(attempt + 1)}/${String(MAX_ATTEMPTS)})`,
      );

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Recursive retry
      return await deputiesJobWithRetry(attempt + 1, failureTime);
    } else {
      // Final failure - update metadata
      console.error(
        `[Job: deputies] Final failure after ${String(attempt)} attempts`,
      );

      await updateScraperMetadata('deputies', false, errorMessage);

      return { success: false, error: errorMessage, executedAt };
    }
  } finally {
    // Only disconnect if this is the final attempt (success or final failure)
    const failureTime = initialFailureTime ?? executedAt;
    const timeSinceInitialFailure = Date.now() - failureTime.getTime();
    const isFinalAttempt =
      attempt >= MAX_ATTEMPTS || timeSinceInitialFailure >= ONE_HOUR_MS;

    if (isFinalAttempt) {
      await prisma.$disconnect();
    }
  }
}

/**
 * Main entry point for Bree scheduler
 */
// eslint-disable-next-line import-x/no-default-export -- Bree requires default export
export default async function deputiesJob(): Promise<JobResult> {
  return await deputiesJobWithRetry(1);
}

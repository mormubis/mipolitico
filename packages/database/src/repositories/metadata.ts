import { prisma } from '../client.ts';

import type { ScraperMetadata } from '@prisma/client';

/**
 * Update scraper metadata after a job attempt
 * Tracks success/failure, timestamps, and error messages
 *
 * @param scraperType - Type of scraper (deputies or voting)
 * @param success - Whether the scraper run succeeded
 * @param error - Error message if failed
 */
export async function updateScraperMetadata(
  scraperType: 'deputies' | 'voting',
  success: boolean,
  error?: string,
): Promise<void> {
  try {
    if (success) {
      // On success: update lastSuccessfulRun, reset attemptCount, clear error
      await prisma.scraperMetadata.upsert({
        where: { scraperType },
        update: {
          lastSuccessfulRun: new Date(),
          lastAttemptedRun: new Date(),
          attemptCount: 0,
          lastError: null,
        },
        create: {
          scraperType,
          lastSuccessfulRun: new Date(),
          lastAttemptedRun: new Date(),
          attemptCount: 0,
          lastError: null,
        },
      });
    } else {
      // On failure: increment attemptCount, set error, update lastAttemptedRun
      const existing = await prisma.scraperMetadata.findUnique({
        where: { scraperType },
      });

      await prisma.scraperMetadata.upsert({
        where: { scraperType },
        update: {
          lastAttemptedRun: new Date(),
          attemptCount: (existing?.attemptCount ?? 0) + 1,
          lastError: error ?? 'Unknown error',
        },
        create: {
          scraperType,
          lastAttemptedRun: new Date(),
          attemptCount: 1,
          lastError: error ?? 'Unknown error',
        },
      });
    }
  } catch (err) {
    // Log error but don't throw - let caller handle
    console.error(
      `[metadata] Failed to update metadata for ${scraperType}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Get all scraper metadata for monitoring
 * Used by health check endpoints
 */
export async function getScraperMetadata(): Promise<ScraperMetadata[]> {
  try {
    return await prisma.scraperMetadata.findMany({
      orderBy: { scraperType: 'asc' },
    });
  } catch (err) {
    // Log error but don't throw - return empty array
    console.error(
      '[metadata] Failed to get scraper metadata:',
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

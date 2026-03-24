import {
  upsertDeputies,
  upsertInitiatives,
  upsertInterestDeclaration,
  upsertInterventions,
  upsertOrganMembers,
  upsertParties,
  upsertPersonDetail,
  upsertVotingRecords,
} from '@congress/database';
import { bufferCount, map, mergeMap, reduce, scan, tap } from 'rxjs';

import { SKIP_SENTINEL } from '../utils.ts';

import type { Sink } from '../types.ts';

const BATCH_SIZE = 500;

interface PersistResult {
  source: string;
  batches: number;
  totalSuccess: number;
  totalSkipped: number;
  totalValidationSkipped?: number;
  totalSessions?: number;
}

interface BatchResult {
  totalSuccess: number;
  totalSkipped: number;
}

/**
 * Generic factory that creates a batched persist sink for any upsert function
 * returning { success, skipped }.
 * Records that are SKIP_SENTINEL (validation failures from validate()) are
 * counted separately as totalValidationSkipped and excluded from upsert.
 */
function createBatchedSink(
  tag: string,
  upsert: (batch: unknown[]) => Promise<BatchResult>,
): Sink<unknown, PersistResult> {
  return (source) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const validationSkipped = batch.filter(
          (r) => r === SKIP_SENTINEL,
        ).length;
        const valid = batch.filter((r) => r !== SKIP_SENTINEL);
        const result =
          valid.length > 0
            ? await upsert(valid)
            : { totalSuccess: 0, totalSkipped: 0 };
        return {
          totalSuccess: result.totalSuccess,
          totalSkipped: result.totalSkipped,
          totalValidationSkipped: validationSkipped,
        };
      }),
      scan(
        (acc, r) => ({
          batch: acc.batch + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
          totalValidationSkipped:
            acc.totalValidationSkipped + r.totalValidationSkipped,
        }),
        {
          batch: 0,
          totalSuccess: 0,
          totalSkipped: 0,
          totalValidationSkipped: 0,
        },
      ),
      tap(({ batch, totalSuccess, totalSkipped, totalValidationSkipped }) => {
        const validErr =
          totalValidationSkipped > 0
            ? `, ${String(totalValidationSkipped)} invalid`
            : '';
        console.log(
          `[${tag}] Batch ${String(batch)}: ${String(totalSuccess)} success, ${String(totalSkipped)} skipped${validErr}`,
        );
      }),
      reduce(
        (acc, r) => ({
          batches: acc.batches + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
          totalValidationSkipped:
            acc.totalValidationSkipped + r.totalValidationSkipped,
        }),
        {
          batches: 0,
          totalSuccess: 0,
          totalSkipped: 0,
          totalValidationSkipped: 0,
        },
      ),
      map((acc) => ({ source: tag, ...acc })),
      tap((r) => {
        const validErr =
          r.totalValidationSkipped > 0
            ? `, ${String(r.totalValidationSkipped)} invalid`
            : '';
        console.log(
          `[${tag}] Complete: ${String(r.batches)} batches, ${String(r.totalSuccess)} success, ${String(r.totalSkipped)} skipped${validErr}`,
        );
      }),
    );
}

/**
 * RxJS operator that buffers deputy records and persists to database
 */
function persistDeputies(
  options: { legislature?: number } = {},
): Sink<unknown, PersistResult> {
  return createBatchedSink('deputies', async (batch) => {
    const result = await upsertDeputies(batch, options);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}

/**
 * RxJS operator that buffers voting records and persists to database
 */
function persistVotes(): Sink<unknown, PersistResult> {
  return (source) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const validationSkipped = batch.filter(
          (r) => r === SKIP_SENTINEL,
        ).length;
        const valid = batch.filter((r) => r !== SKIP_SENTINEL);
        const result =
          valid.length > 0
            ? await upsertVotingRecords(valid)
            : { votes: 0, skipped: 0, sessions: 0 };
        return {
          totalSuccess: result.votes,
          totalSkipped: result.skipped,
          totalSessions: result.sessions,
          totalValidationSkipped: validationSkipped,
        };
      }),
      scan(
        (acc, r) => ({
          batch: acc.batch + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
          totalSessions: acc.totalSessions + r.totalSessions,
          totalValidationSkipped:
            acc.totalValidationSkipped + r.totalValidationSkipped,
        }),
        {
          batch: 0,
          totalSuccess: 0,
          totalSkipped: 0,
          totalSessions: 0,
          totalValidationSkipped: 0,
        },
      ),
      tap(
        ({
          batch,
          totalSessions,
          totalSuccess,
          totalSkipped,
          totalValidationSkipped,
        }) => {
          const validErr =
            totalValidationSkipped > 0
              ? `, ${String(totalValidationSkipped)} invalid`
              : '';
          console.log(
            `[votes] Batch ${String(batch)}: ${String(totalSessions)} sessions, ${String(totalSuccess)} votes, ${String(totalSkipped)} skipped${validErr}`,
          );
        },
      ),
      reduce(
        (acc, r) => ({
          batches: acc.batches + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
          totalSessions: acc.totalSessions + r.totalSessions,
          totalValidationSkipped:
            acc.totalValidationSkipped + r.totalValidationSkipped,
        }),
        {
          batches: 0,
          totalSuccess: 0,
          totalSkipped: 0,
          totalSessions: 0,
          totalValidationSkipped: 0,
        },
      ),
      map((acc) => ({ source: 'votes', ...acc })),
      tap((r) => {
        const validErr =
          r.totalValidationSkipped > 0
            ? `, ${String(r.totalValidationSkipped)} invalid`
            : '';
        console.log(
          `[votes] Complete: ${String(r.batches)} batches, ${String(r.totalSessions)} sessions, ${String(r.totalSuccess)} votes, ${String(r.totalSkipped)} skipped${validErr}`,
        );
      }),
    );
}

/**
 * RxJS operator that buffers intervention records and persists to database
 */
function persistInterventions(): Sink<unknown, PersistResult> {
  return createBatchedSink('interventions', async (batch) => {
    const result = await upsertInterventions(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}

/**
 * RxJS operator that buffers initiative records and persists to database
 */
function persistInitiatives(): Sink<unknown, PersistResult> {
  return createBatchedSink('initiatives', async (batch) => {
    const result = await upsertInitiatives(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}

/**
 * RxJS operator that persists interest declaration records to database.
 * Each record is upserted individually (no batching) because the repository
 * runs a transaction per declaration.
 */
function persistInterestDeclarations(): Sink<unknown, PersistResult> {
  return (source) =>
    source.pipe(
      mergeMap(async (record) => {
        const success = await upsertInterestDeclaration(record);
        return { totalSuccess: success ? 1 : 0, totalSkipped: success ? 0 : 1 };
      }),
      reduce(
        (acc, r) => ({
          batches: 0,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
        }),
        { batches: 0, totalSuccess: 0, totalSkipped: 0 },
      ),
      map((acc) => ({ source: 'interestDeclarations', ...acc })),
      tap((r) => {
        console.log(
          `[interestDeclarations] Complete: ${String(r.totalSuccess)} success, ${String(r.totalSkipped)} skipped`,
        );
      }),
    );
}

/**
 * RxJS operator that buffers party records and persists to database.
 */
function persistParties(): Sink<unknown, PersistResult> {
  return createBatchedSink('parties', async (batch) => {
    const result = await upsertParties(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}

/**
 * RxJS operator that buffers organ member records and persists to database
 */
function persistOrganMembers(): Sink<unknown, PersistResult> {
  return createBatchedSink('organMembers', async (batch) => {
    const result = await upsertOrganMembers(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}

/**
 * RxJS operator that persists person-detail records to database.
 * Each record is upserted individually (no batching) because each is a
 * targeted update to an existing Person record.
 */
function persistPersonDetail(): Sink<unknown, PersistResult> {
  return (source) =>
    source.pipe(
      mergeMap(async (record) => {
        const success = await upsertPersonDetail(record);
        return { totalSuccess: success ? 1 : 0, totalSkipped: success ? 0 : 1 };
      }),
      reduce(
        (acc, r) => ({
          batches: 0,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
        }),
        { batches: 0, totalSuccess: 0, totalSkipped: 0 },
      ),
      map((acc) => ({ source: 'personDetail', ...acc })),
      tap((r) => {
        console.log(
          `[personDetail] Complete: ${String(r.totalSuccess)} success, ${String(r.totalSkipped)} skipped`,
        );
      }),
    );
}

export {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistInterventions,
  persistOrganMembers,
  persistParties,
  persistPersonDetail,
  persistVotes,
  type PersistResult,
};

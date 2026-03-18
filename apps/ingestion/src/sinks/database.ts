import {
  upsertDeputies,
  upsertInitiatives,
  upsertInterestDeclaration,
  upsertOrganMembers,
  upsertParties,
  upsertPersonDetail,
  upsertSpeeches,
  upsertVotingRecords,
} from '@congress/database';
import { bufferCount, map, mergeMap, reduce, scan, tap } from 'rxjs';

import type { Sink } from '../types.ts';

const BATCH_SIZE = 500;

interface PersistResult {
  source: string;
  batches: number;
  totalSuccess: number;
  totalSkipped: number;
  totalSessions?: number;
}

interface BatchResult {
  totalSuccess: number;
  totalSkipped: number;
}

/**
 * Generic factory that creates a batched persist sink for any upsert function
 * returning { success, skipped }.
 */
function createBatchedSink(
  tag: string,
  upsert: (batch: unknown[]) => Promise<BatchResult>,
): Sink<unknown, PersistResult> {
  return (source) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsert(batch);
        return {
          totalSuccess: result.totalSuccess,
          totalSkipped: result.totalSkipped,
        };
      }),
      scan(
        (acc, r) => ({
          batch: acc.batch + 1,
          totalSuccess: r.totalSuccess,
          totalSkipped: r.totalSkipped,
        }),
        { batch: 0, totalSuccess: 0, totalSkipped: 0 },
      ),
      tap(({ batch, totalSuccess, totalSkipped }) => {
        console.log(
          `[${tag}] Batch ${String(batch)}: ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      reduce(
        (acc, r) => ({
          batches: acc.batches + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
        }),
        { batches: 0, totalSuccess: 0, totalSkipped: 0 },
      ),
      map((acc) => ({ source: tag, ...acc })),
      tap((r) => {
        console.log(
          `[${tag}] Complete: ${String(r.batches)} batches, ${String(r.totalSuccess)} success, ${String(r.totalSkipped)} skipped`,
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
        const result = await upsertVotingRecords(batch);
        return {
          totalSuccess: result.votes,
          totalSkipped: result.skipped,
          totalSessions: result.sessions,
        };
      }),
      scan(
        (acc, r) => ({
          batch: acc.batch + 1,
          totalSuccess: r.totalSuccess,
          totalSkipped: r.totalSkipped,
          totalSessions: r.totalSessions,
        }),
        { batch: 0, totalSuccess: 0, totalSkipped: 0, totalSessions: 0 },
      ),
      tap(({ batch, totalSessions, totalSuccess, totalSkipped }) => {
        console.log(
          `[votes] Batch ${String(batch)}: ${String(totalSessions)} sessions, ${String(totalSuccess)} votes, ${String(totalSkipped)} skipped`,
        );
      }),
      reduce(
        (acc, r) => ({
          batches: acc.batches + 1,
          totalSuccess: acc.totalSuccess + r.totalSuccess,
          totalSkipped: acc.totalSkipped + r.totalSkipped,
          totalSessions: acc.totalSessions + r.totalSessions,
        }),
        { batches: 0, totalSuccess: 0, totalSkipped: 0, totalSessions: 0 },
      ),
      map((acc) => ({ source: 'votes', ...acc })),
      tap((r) => {
        console.log(
          `[votes] Complete: ${String(r.batches)} batches, ${String(r.totalSessions)} sessions, ${String(r.totalSuccess)} votes, ${String(r.totalSkipped)} skipped`,
        );
      }),
    );
}

/**
 * RxJS operator that buffers speech records and persists to database
 */
function persistSpeeches(): Sink<unknown, PersistResult> {
  return createBatchedSink('speeches', async (batch) => {
    const result = await upsertSpeeches(batch);
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
      tap((r) =>
        { console.log(
          `[personDetail] Complete: ${String(r.totalSuccess)} success, ${String(r.totalSkipped)} skipped`,
        ); },
      ),
    );
}

export {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistParties,
  persistPersonDetail,
  persistSpeeches,
  persistVotes,
  type PersistResult,
};

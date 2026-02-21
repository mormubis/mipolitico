import {
  upsertDeputies,
  upsertOrganMembers,
  upsertSpeeches,
  upsertVotingRecords,
} from '@congress/database';
import { Observable, bufferCount, finalize, mergeMap } from 'rxjs';

import type { OperatorFunction } from 'rxjs';

const BATCH_SIZE = 500;

export interface PersistResult {
  source: string;
  batches: number;
  totalSuccess: number;
  totalSkipped: number;
}

/**
 * RxJS operator that buffers deputy records and persists to database
 */
export function persistDeputies(
  options: { legislature?: number } = {},
): OperatorFunction<unknown, PersistResult> {
  let batches = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertDeputies(batch, options);
        batches++;
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        console.log(
          `[deputies] Batch ${String(batches)}: ${String(result.success)} success, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[deputies] Complete: ${String(batches)} batches, ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      // Use a custom approach to emit final result
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'deputies',
                batches,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}

/**
 * RxJS operator that buffers voting records and persists to database
 */
export function persistVotes(): OperatorFunction<unknown, PersistResult> {
  let batches = 0;
  let totalSessions = 0;
  let totalVotes = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertVotingRecords(batch);
        batches++;
        totalSessions += result.sessions;
        totalVotes += result.votes;
        totalSkipped += result.skipped;
        console.log(
          `[votes] Batch ${String(batches)}: ${String(result.sessions)} sessions, ${String(result.votes)} votes, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[votes] Complete: ${String(batches)} batches, ${String(totalSessions)} sessions, ${String(totalVotes)} votes, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'votes',
                batches,
                totalSuccess: totalVotes,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}

/**
 * RxJS operator that buffers speech records and persists to database
 */
export function persistSpeeches(): OperatorFunction<unknown, PersistResult> {
  let batches = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertSpeeches(batch);
        batches++;
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        console.log(
          `[speeches] Batch ${String(batches)}: ${String(result.success)} success, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[speeches] Complete: ${String(batches)} batches, ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'speeches',
                batches,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}

/**
 * RxJS operator that buffers organ member records and persists to database
 */
export function persistOrganMembers(): OperatorFunction<
  unknown,
  PersistResult
> {
  let batches = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertOrganMembers(batch);
        batches++;
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        console.log(
          `[organMembers] Batch ${String(batches)}: ${String(result.success)} success, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[organMembers] Complete: ${String(batches)} batches, ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'organMembers',
                batches,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}

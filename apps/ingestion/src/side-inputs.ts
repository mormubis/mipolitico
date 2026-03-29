import { concat, reduce, shareReplay } from 'rxjs';

import type { Observable } from 'rxjs';

/**
 * Builds a side input from a data stream.
 * Accumulates all records into a Map<K, V> and emits the complete map
 * exactly once when the source stream completes.
 * shareReplay(1) caches the result for late subscribers.
 */
function buildSideInput<T, K, V>(
  source$: Observable<T>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V,
): Observable<Map<K, V>> {
  return source$.pipe(
    reduce((map, item) => {
      map.set(keyFn(item), valueFn(item));
      return map;
    }, new Map<K, V>()),
    shareReplay(1),
  );
}

/**
 * Builds a side input pre-populated from a database seed, then augmented
 * by live stream data. Used in delta runs where existing data is already
 * in the database.
 *
 * For from-scratch runs, pass EMPTY as seed$.
 */
function buildSeededSideInput<T, K, V>(
  seed$: Observable<T>,
  live$: Observable<T>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V,
): Observable<Map<K, V>> {
  return buildSideInput(concat(seed$, live$), keyFn, valueFn);
}

export { buildSeededSideInput, buildSideInput };

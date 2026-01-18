import { Observable, merge, retry } from 'rxjs';

import { fetch, launch } from './network/index.ts';
import * as intervention from './sources/intervention.ts';

import type { Finder, Needle, Retriever } from './sources/types.ts';

const browser = await launch({ headless: false });

async function find(finder: Finder): Promise<Needle[]> {
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
  return new Observable((subscriber) => {
    try {
      merge(
        ...needles.map((needle) =>
          retriever({ ...needle, browser, fetch }).pipe(
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

const needles = await find(intervention.finder);
retrieve(intervention.retriever, needles).subscribe({
  complete: () => void browser.close(),
  error(error) {
    console.error(error);
    void browser.close();
  },
  next: console.log,
});

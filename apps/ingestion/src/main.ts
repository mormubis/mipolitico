import { Observable, merge, retry } from 'rxjs';

import { fetch, launch } from './network/index.ts';
import * as person from './sources/person-detail.ts';

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
            retry({ delay: 15 * 1000 }),
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

const needles = await find(person.finder);
retrieve(person.retriever, needles).subscribe({
  complete: () => void browser.close(),
  error: console.error,
  next: console.log,
});

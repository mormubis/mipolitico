import { Observable } from 'rxjs';

import { retriever as personDetailRetriever } from './personDetail.ts';

import type { Model as PersonDetailModel } from './personDetail.ts';
import type { Retriever } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

const retriever: Retriever<InterestDeclarationInput> = (options) => {
  return new Observable((subscriber) => {
    const year = new Date().getFullYear();

    const sub = personDetailRetriever(options).subscribe({
      next: (record: PersonDetailModel) => {
        subscriber.next({
          DEPUTY_ID: String(record.COD_PARLAMENTARIO),
          PDF_URL: record.DECLARACION_BIENES_URL,
          YEAR: year,
        });
      },
      error: (err: unknown) => {
        subscriber.error(err);
      },
      complete: () => {
        subscriber.complete();
      },
    });

    return () => {
      sub.unsubscribe();
    };
  });
};

export { retriever };

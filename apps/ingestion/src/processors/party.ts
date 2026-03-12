import { Observable, reduce } from 'rxjs';

import { PARTY_PARENTS } from '../config/party-parents.ts';

import type { PartyInput } from '@congress/database';
import type { OperatorFunction } from 'rxjs';

interface PersonModel {
  FORMACIONELECTORAL: string;
}
interface PersonDetailModel {
  FORMACION: string;
  FORMACIONELECTORAL: string;
}
type Input = PersonModel | PersonDetailModel;

function hasFormacion(input: Input): input is PersonDetailModel {
  return 'FORMACION' in input && typeof input.FORMACION === 'string';
}

export const processor: OperatorFunction<Input, PartyInput> = (source$) =>
  new Observable<PartyInput>((subscriber) => {
    source$
      .pipe(
        reduce((acc, record) => {
          const shortName = record.FORMACIONELECTORAL.trim();
          if (!shortName) return acc;

          const existing = acc.get(shortName) ?? {
            shortName,
            name: undefined as string | undefined,
            parentShortName: PARTY_PARENTS[shortName],
          };

          if (hasFormacion(record) && record.FORMACION.trim()) {
            existing.name = record.FORMACION.trim();
          }

          acc.set(shortName, existing);
          return acc;
        }, new Map<string, PartyInput>()),
      )
      .subscribe({
        next: (map) => {
          for (const entry of map.values()) {
            subscriber.next(entry);
          }
          subscriber.complete();
        },
        error: (err: unknown) => {
          subscriber.error(err);
        },
      });
  });

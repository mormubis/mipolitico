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

// Intermediate accumulator type — entries without a name are incomplete and
// will not be emitted. name is required on PartyInput (Party.name is non-nullable).
interface PartialParty {
  shortName: string;
  name?: string;
  parentShortName?: string;
}

function hasFormacion(input: Input): input is PersonDetailModel {
  return 'FORMACION' in input && typeof input.FORMACION === 'string';
}

export const processor: OperatorFunction<Input, PartyInput> = (source$) =>
  new Observable<PartyInput>((subscriber) => {
    return source$
      .pipe(
        reduce((acc, record) => {
          const shortName = record.FORMACIONELECTORAL.trim();
          if (!shortName) return acc;

          const existing = acc.get(shortName) ?? {
            shortName,
            parentShortName: PARTY_PARENTS[shortName],
          };

          if (hasFormacion(record) && record.FORMACION.trim()) {
            existing.name = record.FORMACION.trim();
          }

          acc.set(shortName, existing);
          return acc;
        }, new Map<string, PartialParty>()),
      )
      .subscribe({
        next: (map) => {
          for (const entry of map.values()) {
            // Only emit complete entries — defer parties without a full name
            // to the next run when person-detail data is available.
            if (entry.name) {
              subscriber.next(entry as PartyInput);
            }
          }
          subscriber.complete();
        },
        error: (err: unknown) => {
          subscriber.error(err);
        },
      });
  });

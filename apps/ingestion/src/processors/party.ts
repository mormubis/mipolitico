import { mergeMap, of, pipe, reduce } from 'rxjs';

import { PARTY_NAMES, PARTY_PARENTS } from '../config/party-parents.ts';
import { emit } from '../types.ts';

import type { Processor } from '../types.ts';
import type { PartyInput } from '@congress/database';

interface PersonModel {
  electoralFormation: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const processor: Processor<PersonModel> = (_ctx) =>
  pipe(
    reduce((acc, record: PersonModel) => {
      const shortName = record.electoralFormation.trim();
      if (!shortName) return acc;

      acc.set(shortName, {
        shortName,
        name: PARTY_NAMES[shortName],
        parentShortName: PARTY_PARENTS[shortName],
      });

      return acc;
    }, new Map<string, Partial<PartyInput> & { shortName: string }>()),
    mergeMap((map) =>
      of(
        ...[...map.values()]
          .filter((e): e is PartyInput => {
            if (!e.name) {
              console.warn(
                `[party] No name in PARTY_NAMES for: ${e.shortName} — add it to config/party-parents.ts`,
              );
              return false;
            }
            return true;
          })
          .map((partyRecord) => emit('party', partyRecord)),
      ),
    ),
  );

export { processor };

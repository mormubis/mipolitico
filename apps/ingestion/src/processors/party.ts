import { mergeMap, of, pipe, reduce } from 'rxjs';

import { PARTY_NAMES, PARTY_PARENTS } from '../config/party-parents.ts';

import type { PartyInput } from '@congress/database';
import type { OperatorFunction } from 'rxjs';

interface PersonModel {
  electoralFormation: string;
}
type Input = PersonModel;

const processor: OperatorFunction<Input, PartyInput> = pipe(
  reduce((acc, record) => {
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
      ...[...map.values()].filter((e): e is PartyInput => {
        if (!e.name) {
          console.warn(
            `[party] No name in PARTY_NAMES for: ${e.shortName} — add it to config/party-parents.ts`,
          );
          return false;
        }
        return true;
      }),
    ),
  ),
);

export { processor };

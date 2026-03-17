import { mergeMap, of, pipe, reduce } from 'rxjs';

import { PARTY_PARENTS } from '../config/party-parents.ts';

import type { PartyInput } from '@congress/database';
import type { OperatorFunction } from 'rxjs';

interface PersonModel {
  electoralFormation: string;
}
interface PersonDetailModel {
  electoralFormation: string;
  partyName?: string;
}
type Input = PersonModel | PersonDetailModel;

// Intermediate accumulator type — entries without a name are incomplete and
// will not be emitted. name is required on PartyInput (Party.name is non-nullable).
interface PartialParty {
  shortName: string;
  name?: string;
  parentShortName?: string;
}

function hasPartyName(input: Input): input is PersonDetailModel {
  return 'partyName' in input && typeof input.partyName === 'string';
}

const processor: OperatorFunction<Input, PartyInput> = pipe(
  reduce((acc, record) => {
    const shortName = record.electoralFormation.trim();
    if (!shortName) return acc;

    const existing = acc.get(shortName) ?? {
      shortName,
      parentShortName: PARTY_PARENTS[shortName],
    };

    if (hasPartyName(record) && record.partyName?.trim()) {
      existing.name = record.partyName.trim();
    }

    acc.set(shortName, existing);
    return acc;
  }, new Map<string, PartialParty>()),
  mergeMap((map) =>
    of(
      // Only emit complete entries — defer parties without a full name
      // to the next run when person-detail data is available.
      ...[...map.values()].filter((e): e is Required<PartialParty> => {
        if (!e.name) {
          console.warn(
            `[party] Skipping party with no full name: ${e.shortName}`,
          );
          return false;
        }
        return true;
      }),
    ),
  ),
);

export { processor };

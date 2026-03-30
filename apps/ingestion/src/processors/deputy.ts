import { concat, defer, from, map, tap } from 'rxjs';

import { PARTY_NAMES, PARTY_PARENTS } from '../config/party-parents.ts';
import { emit } from '../types.ts';

import type { Processor } from '../types.ts';
import type { PartyInput } from '@congress/database';

interface DeputyModel {
  electoralFormation: string;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const processor: Processor<DeputyModel> = (_ctx) => (source$) => {
  const parties = new Map<
    string,
    Partial<PartyInput> & { shortName: string }
  >();

  return concat(
    source$.pipe(
      tap((record) => {
        const shortName = record.electoralFormation.trim();
        if (shortName && !parties.has(shortName)) {
          parties.set(shortName, {
            shortName,
            name: PARTY_NAMES[shortName],
            parentShortName: PARTY_PARENTS[shortName],
          });
        }
      }),
      map((record) => emit('deputy', record)),
    ),
    defer(() =>
      from(
        [...parties.values()]
          .filter((e): e is PartyInput => {
            if (!e.name) {
              console.warn(
                `[party] No name in PARTY_NAMES for: ${e.shortName} — add it to config/party-parents.ts`,
              );
              return false;
            }
            return true;
          })
          .map((p) => emit('party', p)),
      ),
    ),
  );
};

export { processor };

import { createId } from '@paralleldrive/cuid2';
import { EMPTY, from, mergeMap, pipe, reduce, withLatestFrom } from 'rxjs';

import { NAME_OVERRIDES } from '../corrections/name-overrides.ts';
import { emit } from '../types.ts';
import { normalizeSpanishName } from '../utils.ts';

import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { GovernmentMemberInput } from '@congress/database';

// Patterns that indicate a national government role
const GOVERNMENT_ROLE_PATTERN =
  /ministro|ministra|vicepresidente del gobierno|vicepresidenta del gobierno|presidente del gobierno|secretario de estado|secretaria de estado/i;

const processor: Processor<BulkModel> = (ctx) =>
  pipe(
    reduce((acc: Map<string, GovernmentMemberInput>, row) => {
      const role = row.CARGOORADOR ?? '';
      if (!role || !GOVERNMENT_ROLE_PATTERN.test(role)) return acc;

      // Strip parliamentary group code: "Montero Cuadrado, María Jesús (GS)" → "Montero Cuadrado, María Jesús"
      const rawName = (row.ORADOR ?? '').replace(/\s*\([^)]+\)\s*$/, '').trim();
      if (!rawName) return acc;

      // Apply name overrides for ALL-CAPS former minister names
      const canonicalName = NAME_OVERRIDES[rawName] ?? rawName;

      const key = `${canonicalName}::${role}`;
      if (!acc.has(key)) {
        acc.set(key, {
          id: createId(),
          name: canonicalName,
          role,
          legislature: 15,
        });
      }
      return acc;
    }, new Map<string, GovernmentMemberInput>()),
    mergeMap((map) => (map.size > 0 ? from([...map.values()]) : EMPTY)),
    withLatestFrom(ctx.personMap$),
    mergeMap(([record, personMap]) => {
      const key = normalizeSpanishName(record.name);
      const personId = personMap.get(key);
      return [emit('governmentMember', { ...record, personId })];
    }),
  );

export { processor };

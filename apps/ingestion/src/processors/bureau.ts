import { map, withLatestFrom } from 'rxjs';

import { normalizeSpanishName } from '../utils.ts';

import type { Model } from '../retrievers/bureau.ts';
import type { Processor } from '../types.ts';
import type { BureauInput } from '@congress/database';

const processor: Processor<Model, BureauInput> = (ctx) => (source$) =>
  source$.pipe(
    withLatestFrom(ctx.personMap$),
    map(([record, personMap]) => {
      const personId = personMap.get(normalizeSpanishName(record.name));
      return {
        endDate: record.endDate,
        group: record.group,
        name: record.name,
        organName: record.organName,
        personId,
        position: record.position,
        startDate: record.startDate,
      } satisfies BureauInput;
    }),
  );

export { processor };

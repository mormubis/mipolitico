import { prisma } from '@congress/database';
import { mergeMap } from 'rxjs';

import type { Model } from '../retrievers/bureau.ts';
import type { Processor } from '../types.ts';
import type { BureauInput } from '@congress/database';

const processor: Processor<Model, BureauInput> = (source$) =>
  source$.pipe(
    mergeMap(async (record) => {
      const person = await prisma.person.findUnique({
        where: { name: record.name },
        select: { id: true },
      });

      return {
        endDate: record.endDate,
        group: record.group,
        name: record.name,
        organName: record.organName,
        personId: person?.id,
        position: record.position,
        startDate: record.startDate,
      } satisfies BureauInput;
    }),
  );

export { processor };

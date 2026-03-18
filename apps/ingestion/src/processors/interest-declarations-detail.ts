import { prisma } from '@congress/database';
import { EMPTY, mergeMap, of } from 'rxjs';

import type { Processor } from '../types.ts';
import type {
  InterestDeclarationDetailInput,
  InterestDeclarationInput,
} from '@congress/database';

/**
 * Resolves name → Deputy.id before storing interest declaration PDFs.
 *
 * Looks up the Person by name, then finds their Deputy record for the current
 * legislature. Skips records where no matching Deputy is found — this means
 * person + person-detail must run before interest-declarations-detail.
 */
const processor: Processor<
  InterestDeclarationDetailInput,
  InterestDeclarationInput
> = (source$) =>
  source$.pipe(
    mergeMap(async (record) => {
      const person = await prisma.person.findFirst({
        where: { name: record.name },
        select: {
          deputies: {
            select: { id: true },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
        },
      });

      const deputyId = person?.deputies[0]?.id;

      if (!deputyId) {
        console.warn(
          `[interestDeclarationsDetail] No deputy found for name: ${record.name} (codParlamentario: ${String(record.codParlamentario)})`,
        );
        return null;
      }

      return {
        deputyId,
        pdfUrl:
          record.pdfActividades ?? record.pdfInteresesEconomicos ?? undefined,
        year: new Date().getFullYear(),
      } satisfies InterestDeclarationInput;
    }),
    mergeMap((record) => (record ? of(record) : EMPTY)),
  );

export { processor };

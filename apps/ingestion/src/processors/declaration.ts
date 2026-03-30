import { prisma } from '@congress/database';
import { EMPTY, from, mergeMap, pipe, reduce } from 'rxjs';

import type { Model } from '../retrievers/declaration.ts';
import type { Processor } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

const processor: Processor<Model, InterestDeclarationInput> = pipe(
  reduce((acc: Map<string, Model[]>, row) => {
    const existing = acc.get(row.NOMBRE) ?? [];
    acc.set(row.NOMBRE, [...existing, row]);
    return acc;
  }, new Map<string, Model[]>()),
  mergeMap((map) =>
    from(
      Promise.all(
        [...map.entries()].map(async ([name, rows]) => {
          const firstRow = rows[0];
          if (!firstRow) return null;

          const yearStr = firstRow.FECHAREGISTRO.split('/')[2];
          const year = yearStr ? parseInt(yearStr, 10) : NaN;
          if (isNaN(year)) return null;

          // Normalize name: docacteco uses "Surname,Name" (no space after comma)
          // but Person stores "Surname, Name" (space after comma)
          const normalizedName = name.replace(/,(\S)/g, ', $1');
          const person = await prisma.person.findFirst({
            where: { name: normalizedName },
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
              `[interestDeclarations] No deputy found for name: ${name}`,
            );
            return null;
          }

          const professionalActivities = rows
            .filter((r) => r.TIPO === 'ACTIVIDAD')
            .map((r) => ({
              entity: r.EMPLEADOR ?? '',
              position: r.DESCRIPCION ?? '',
              remunerated: r.SECTOR === 'PÚBLICO' || r.SECTOR === 'PRIVADO',
              startDate: r.PERIODO,
            }));

          const donations = rows
            .filter((r) => r.TIPO === 'DONACION')
            .map((r) => ({
              ...(r.BENEFACTOR != null && { benefactor: r.BENEFACTOR }),
              description: r.DESCRIPCION ?? '',
            }));

          const foundations = rows
            .filter((r) => r.TIPO === 'FUNDACIONES')
            .map((r) => ({
              ...(r.DESCRIPCION != null && { description: r.DESCRIPCION }),
              recipient: r.DESTINATARIO ?? '',
            }));

          const observations = rows
            .filter((r) => r.TIPO === 'OBSERVACIONES')
            .map((r) => ({
              text: r.OBSERVACIONES ?? '',
            }));

          const result: InterestDeclarationInput = {
            deputyId,
            donations: donations.length > 0 ? donations : undefined,
            foundations: foundations.length > 0 ? foundations : undefined,
            observations: observations.length > 0 ? observations : undefined,
            professionalActivities:
              professionalActivities.length > 0
                ? professionalActivities
                : undefined,
            year,
          };

          return result;
        }),
      ),
    ),
  ),
  mergeMap((results) =>
    results.length > 0
      ? from(results.filter((r): r is InterestDeclarationInput => r !== null))
      : EMPTY,
  ),
);

export { processor };

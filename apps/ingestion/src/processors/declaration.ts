import { EMPTY, from, mergeMap, pipe, reduce, withLatestFrom } from 'rxjs';

import { normalizeSpanishName } from '../utils.ts';

import type { Model } from '../retrievers/declaration.ts';
import type { Processor } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

const processor: Processor<Model, InterestDeclarationInput> = (ctx) =>
  pipe(
    reduce((acc: Map<string, Model[]>, row) => {
      const existing = acc.get(row.NOMBRE) ?? [];
      acc.set(row.NOMBRE, [...existing, row]);
      return acc;
    }, new Map<string, Model[]>()),
    withLatestFrom(ctx.deputyMap$),
    mergeMap(([map, deputyMap]) => {
      const results: InterestDeclarationInput[] = [];

      for (const [name, rows] of map.entries()) {
        const firstRow = rows[0];
        if (!firstRow) continue;

        const yearStr = firstRow.FECHAREGISTRO.split('/')[2];
        const year = yearStr ? parseInt(yearStr, 10) : NaN;
        if (isNaN(year)) continue;

        const normalizedName = name.replace(/,(\S)/g, ', $1');
        const deputyId = deputyMap.get(normalizeSpanishName(normalizedName));

        if (!deputyId) {
          console.warn(
            `[interestDeclarations] No deputy found for name: ${name}`,
          );
          continue;
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

        results.push({
          deputyId,
          donations: donations.length > 0 ? donations : undefined,
          foundations: foundations.length > 0 ? foundations : undefined,
          observations: observations.length > 0 ? observations : undefined,
          professionalActivities:
            professionalActivities.length > 0
              ? professionalActivities
              : undefined,
          year,
        });
      }

      return results.length > 0 ? from(results) : EMPTY;
    }),
  );

export { processor };

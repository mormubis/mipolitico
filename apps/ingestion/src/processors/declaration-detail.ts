import { EMPTY, mergeMap, of, withLatestFrom } from 'rxjs';

import { normalizeSpanishName } from '../utils.ts';

import type { Processor } from '../types.ts';
import type {
  InterestDeclarationDetailInput,
  InterestDeclarationInput,
} from '@congress/database';

/**
 * Resolves name → Deputy.id before storing interest declaration PDFs.
 *
 * Uses the deputyMap$ side input built from the person stream so that
 * person + person-detail must run before interest-declarations-detail.
 */
const processor: Processor<
  InterestDeclarationDetailInput,
  InterestDeclarationInput
> = (ctx) => (source$) =>
  source$.pipe(
    withLatestFrom(ctx.deputyMap$),
    mergeMap(([record, deputyMap]) => {
      const deputyId = deputyMap.get(normalizeSpanishName(record.name));

      if (!deputyId) {
        console.warn(
          `[interestDeclarationsDetail] No deputy found for name: ${record.name} (codParlamentario: ${String(record.codParlamentario)})`,
        );
        return EMPTY;
      }

      return of({
        deputyId,
        pdfUrl:
          record.pdfActividades ?? record.pdfInteresesEconomicos ?? undefined,
        year: new Date().getFullYear(),
      } satisfies InterestDeclarationInput);
    }),
  );

export { processor };

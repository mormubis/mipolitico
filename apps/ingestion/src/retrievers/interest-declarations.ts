import { Observable } from 'rxjs';

import { random } from '../utils.ts';

import type {
  BulkDeclarationRow,
  InterestDeclarationsNeedleExtra,
} from '../finders/interest-declarations.ts';
import type { Retriever } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

function parsePeriodToDate(year: string): string {
  return `${year.trim()}-01-01`;
}

function parsePeriod(periodo: string): {
  startDate?: string;
  endDate?: string;
} {
  const parts = periodo
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 || parts[0] === undefined) return {};
  if (parts.length === 1) return { startDate: parsePeriodToDate(parts[0]) };

  const last = parts[parts.length - 1];

  return {
    startDate: parsePeriodToDate(parts[0]),
    endDate: last !== undefined ? parsePeriodToDate(last) : undefined,
  };
}

function mapActivities(
  rows: BulkDeclarationRow[],
): NonNullable<InterestDeclarationInput['PROFESSIONAL_ACTIVITIES']> {
  return rows
    .filter((r) => r.TIPO === 'ACTIVIDAD')
    .map((r) => ({
      entity: r.EMPLEADOR,
      position: r.DESCRIPCION,
      remunerated: r.SECTOR !== 'PÚBLICO',
      ...parsePeriod(r.PERIODO),
    }));
}

const retriever: Retriever<InterestDeclarationInput> = ({
  browser,
  extra,
  url,
}) => {
  return new Observable((subscriber) => {
    void (async () => {
      const needleExtra = extra as InterestDeclarationsNeedleExtra;

      if (!Array.isArray(needleExtra.declarations)) {
        subscriber.error(
          new Error(
            `Invalid extra payload for interestDeclarations retriever at ${url}`,
          ),
        );
        return;
      }

      const page = await browser.newPage();

      try {
        await page.goto(url);

        const pdfUrl = await page
          .getByText('Declaración de Intereses Económicos')
          .first()
          .getAttribute('href', { timeout: random(1000, 3000) })
          .catch(() => undefined);

        const activities = mapActivities(needleExtra.declarations);

        subscriber.next({
          DEPUTY_ID: String(needleExtra.codParlamentario),
          PDF_URL: pdfUrl ?? undefined,
          PROFESSIONAL_ACTIVITIES:
            activities.length > 0 ? activities : undefined,
          YEAR: new Date().getFullYear(),
        });

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(
            `Unable to retrieve interest declaration from ${url}: ${(cause as Error).message}`,
            { cause },
          ),
        );
      } finally {
        await page.close().catch(() => undefined);
      }
    })();
  });
};

export { retriever };

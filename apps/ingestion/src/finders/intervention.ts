import { getLastSuccessfulRun } from '@congress/database';
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date {
  const parts = ddmmyyyy.split('/');
  const dd = parts[0] ?? '01';
  const mm = parts[1] ?? '01';
  const yyyy = parts[2] ?? '1970';
  const date = new Date(`${yyyy}-${mm}-${dd}`);

  if (isNaN(date.getTime())) {
    console.warn(`[intervention] Could not parse date: ${ddmmyyyy}`);
    return new Date(0);
  }

  return date;
}

interface BulkInterventionRow {
  LEGISLATURA: string;
  OBJETOINICIATIVA: string;
  SESION: string; // DD/MM/YYYY
  ORGANO: string;
  FASE: string;
  TIPOINTERVENCION: string;
  ORADOR: string;
  CARGOORADOR: string;
  INICIOINTERVENCION: string;
  FININTERVENCION: string;
  ENLACEDIFERIDO: string;
  ENLACEDESCARGADIRECTA: string;
  ENLACETEXTOINTEGRO: string;
  ENLACEPDF: string;
}

const finder: Finder = ({ browser, fetch }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        const lastRun = await getLastSuccessfulRun('intervention');
        const dateFrom = lastRun ?? LEGISLATURE_XV_START;

        await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
          waitUntil: 'networkidle',
        });

        const href = await page
          .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
          .first()
          .getAttribute('href');

        if (!href) {
          subscriber.error(
            new Error(
              '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
            ),
          );
          return;
        }

        const url = new URL(href, 'https://www.congreso.es').href;
        const response = await fetch(url);

        if (!response.ok) {
          subscriber.error(
            new Error(
              `[intervention] Failed to fetch bulk JSON: ${response.status.toString()} ${response.statusText}`,
            ),
          );
          return;
        }

        const rows = (await response.json()) as BulkInterventionRow[];
        const seen = new Set<string>();

        for (const row of rows) {
          if (!row.ENLACETEXTOINTEGRO) continue;
          if (seen.has(row.ENLACETEXTOINTEGRO)) continue;
          if (parseSpanishDate(row.SESION) <= dateFrom) continue;

          seen.add(row.ENLACETEXTOINTEGRO);
          subscriber.next(row.ENLACETEXTOINTEGRO);
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export type { BulkInterventionRow };
export { finder };

import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

interface BulkInterventionRow {
  ENLACETEXTOINTEGRO: string;
}

const finder: Finder = ({ browser, fetch }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
          waitUntil: 'networkidle',
        });

        const link = await page
          .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
          .first()
          .getAttribute('href');

        if (!link) {
          subscriber.error(
            new Error(
              '[interventionDetail] Could not find IntervencionesCronologicamente JSON link on opendata page',
            ),
          );
          return;
        }

        const url = new URL(link, 'https://www.congreso.es').href;
        const response = await fetch(url);

        if (!response.ok) {
          subscriber.error(
            new Error(
              `[interventionDetail] Failed to fetch bulk JSON: ${String(response.status)} ${response.statusText}`,
            ),
          );
          return;
        }

        const rows = (await response.json()) as BulkInterventionRow[];
        const seen = new Set<string>();

        for (const row of rows) {
          if (!row.ENLACETEXTOINTEGRO) continue;

          // Strip the page fragment (#(PáginaX)) — the retriever reads the
          // full session transcript regardless of which page anchor is linked.
          const sessionUrl = row.ENLACETEXTOINTEGRO.split('#')[0];
          if (!sessionUrl || seen.has(sessionUrl)) continue;

          seen.add(sessionUrl);
          subscriber.next(sessionUrl);
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados', {
          waitUntil: 'networkidle',
        });

        const activeLink = await page
          .locator('a[href*=DiputadosActivos][href$=json]')
          .getAttribute('href');

        if (!activeLink) {
          subscriber.error(
            new Error(
              '[person] Could not find link to active deputies JSON data on the congress page',
            ),
          );
          return;
        }

        const bajaLink = await page
          .locator('a[href*=DiputadosDeBaja][href$=json]')
          .getAttribute('href');

        subscriber.next(new URL(activeLink, 'https://www.congreso.es').href);

        // Also ingest deputies who left mid-legislature (ministers, resignations, etc.)
        if (bajaLink) {
          subscriber.next(new URL(bajaLink, 'https://www.congreso.es').href);
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

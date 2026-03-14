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

        const link = await page
          .locator('a[href*=DiputadosActivos][href$=json]')
          .getAttribute('href');

        if (!link) {
          subscriber.error(
            new Error(
              '[person] Could not find link to active deputies JSON data on the congress page',
            ),
          );
          return;
        }

        const url = new URL(link, 'https://www.congreso.es');
        subscriber.next(url.href);
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

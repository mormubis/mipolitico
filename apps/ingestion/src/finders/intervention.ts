import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
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
              '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
            ),
          );
          return;
        }

        subscriber.next(new URL(link, 'https://www.congreso.es').href);
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

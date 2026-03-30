import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/iniciativas', {
          waitUntil: 'networkidle',
        });

        const links = await page
          .locator('a[href*="/opendata/iniciativas/"][href$=".json"]')
          .all();

        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href) {
            subscriber.next(new URL(href, 'https://www.congreso.es').href);
          }
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

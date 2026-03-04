import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados');

        const href = await page
          .locator('a[href*="docacteco"][href$="json"]')
          .first()
          .getAttribute('href');

        if (!href) {
          subscriber.error(
            new Error(
              '[interestDeclarations] Could not find docacteco JSON link',
            ),
          );
          return;
        }

        const url = new URL(href, 'https://www.congreso.es').href;
        subscriber.next(url);
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/votaciones', {
          waitUntil: 'networkidle',
        });

        const sections = await page.locator('h4[role="button"]').all();
        for (const section of sections) {
          await section.click();
          await page.waitForLoadState('networkidle');
        }

        const jsonLinks = await page.locator('a[href$=".json"]').all();

        for (const link of jsonLinks) {
          const href = await link.getAttribute('href');
          if (href)
            {subscriber.next(new URL(href, 'https://www.congreso.es').href);}
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

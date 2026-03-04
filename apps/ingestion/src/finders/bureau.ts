import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/organos');

        await Promise.all([
          page.waitForEvent('load'),
          page.getByText('Exportar datos composición').first().click(),
        ]);

        const [request] = await Promise.all([
          page.waitForEvent('requestfinished', { timeout: 3000 }),
          page.getByText('Composición histórica').first().click(),
        ]);

        subscriber.next(request.url());
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

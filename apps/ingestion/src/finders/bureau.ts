import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/organos', {
          waitUntil: 'networkidle',
        });

        await Promise.all([
          page.waitForLoadState('networkidle'),
          page.getByText('Exportar datos composición').first().click(),
        ]);

        const [response] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('composicion') && r.status() === 200,
          ),
          page.getByText('Composición histórica').first().click(),
        ]);

        subscriber.next(response.url());
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };

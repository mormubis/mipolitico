import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const BASE = 'https://www.congreso.es';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(`${BASE}/es/opendata/organos`, {
          waitUntil: 'networkidle',
        });

        // Collect all organ types available in the selector
        const organTypes = await page
          .locator('select')
          .nth(1)
          .evaluate((select) => {
            const el = select as unknown as { options: { value: string }[] };
            return [...el.options].map((o) => o.value);
          });

        for (const organType of organTypes) {
          // Select the organ type
          await Promise.all([
            page.waitForLoadState('networkidle'),
            page.locator('select').nth(1).selectOption(organType),
          ]);

          // Click "Exportar datos composición" and capture the destination URL
          await Promise.all([
            page.waitForURL((u) => !u.toString().includes('opendata/organos'), {
              waitUntil: 'networkidle',
            }),
            page
              .getByRole('button', { name: 'Exportar datos composición' })
              .click(),
          ]);

          subscriber.next(page.url());

          // Go back to the opendata page for the next iteration
          await page.goto(`${BASE}/es/opendata/organos`, {
            waitUntil: 'networkidle',
          });
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

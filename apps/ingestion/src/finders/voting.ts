import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const BASE = 'https://www.congreso.es';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(`${BASE}/es/opendata/votaciones`, {
          waitUntil: 'networkidle',
        });

        // Collect all years available for the current legislature
        const years = await page
          .locator('#calAnios option')
          .evaluateAll((opts) =>
            opts.map((o) => (o as unknown as { value: string }).value),
          );

        for (const year of years) {
          // Select the year
          await Promise.all([
            page.waitForLoadState('networkidle'),
            page.locator('#calAnios').selectOption(year),
          ]);

          // Collect all months available for this year
          const months = await page
            .locator('#calMeses option')
            .evaluateAll((opts) =>
              opts.map((o) => (o as unknown as { value: string }).value),
            );

          for (const month of months) {
            // Select the month
            await Promise.all([
              page.waitForLoadState('networkidle'),
              page.locator('#calMeses').selectOption(month),
            ]);

            // Click each plenary day to load its session links
            const plenoDays = await page.locator('td.day.pleno').all();

            for (const day of plenoDays) {
              await Promise.all([
                page.waitForLoadState('networkidle'),
                day.click(),
              ]);

              const jsonLinks = await page.locator('a[href$=".json"]').all();
              for (const link of jsonLinks) {
                const href = await link.getAttribute('href');
                if (href) subscriber.next(new URL(href, BASE).href);
              }
            }
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

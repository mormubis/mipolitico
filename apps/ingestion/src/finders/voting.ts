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
        const years = await page.locator('#calAnios').evaluate((el) => {
          const s = el as unknown as { options: { value: string }[] };
          return [...s.options].map((o) => o.value);
        });

        for (const year of years) {
          // Select the year and wait for the calendar to re-render
          await page.locator('#calAnios').selectOption(year);
          // Wait for navigation to start and complete
          await page.waitForLoadState('load');
          // Extra wait for calendar JS to initialize
          await page.waitForSelector('#calMeses', { state: 'visible' });

          // Collect all months available for this year
          const months = await page.locator('#calMeses').evaluate((el) => {
            const s = el as unknown as { options: { value: string }[] };
            return [...s.options].map((o) => o.value);
          });

          for (const month of months) {
            // Select the month and wait for calendar to re-render
            await page.locator('#calMeses').selectOption(month);
            await page.waitForLoadState('load');
            // Wait for calendar days to be present
            await page.waitForSelector('table td', { state: 'visible' });

            // Get day numbers of pleno days — day numbers are stable across
            // re-renders, unlike element IDs which are timestamp-based and change
            const plenoDayNumbers = await page
              .locator('td.day.pleno')
              .evaluateAll((tds) =>
                tds.map((td) =>
                  (td as unknown as { textContent: string }).textContent.trim(),
                ),
              );

            for (const dayNumber of plenoDayNumbers) {
              // Re-query by day number text after each click (IDs change on navigation)
              await page
                .locator(`td.day.pleno:has-text("${dayNumber}")`)
                .first()
                .click();
              // Wait for JSON links to appear (some days may have no sessions)
              await page
                .waitForSelector('a[href$=".json"]', {
                  state: 'attached',
                  timeout: 10000,
                })
                .catch(() => null);

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

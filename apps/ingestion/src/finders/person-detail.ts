import { Observable } from 'rxjs';

import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface SearchDeputyItem {
  codParlamentario: number;
  idLegislatura: number;
}

function profileUrl(codParlamentario: number, legislature = 15): string {
  return (
    `https://www.congreso.es/es/busqueda-de-diputados` +
    `?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view` +
    `&_diputadomodule_mostrarFicha=true` +
    `&codParlamentario=${String(codParlamentario)}` +
    `&idLegislatura=${romanize(legislature)}`
  );
}

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados', {
          waitUntil: 'networkidle',
        });

        const searchHref = await page
          .locator('a[href*="busqueda-de-diputados"][href*="statusOpendata"]')
          .first()
          .getAttribute('href');

        if (!searchHref) {
          subscriber.error(
            new Error(
              '[personDetail] Could not find búsqueda personalizada link on opendata/diputados page',
            ),
          );
          return;
        }

        // Emit profile URLs for active deputies via searchDiputados POST
        const searchUrl = new URL(searchHref, 'https://www.congreso.es').href;
        const [response] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes('searchDiputados') &&
              r.request().method() === 'POST',
            { timeout: 15000 },
          ),
          page.goto(searchUrl, { waitUntil: 'networkidle' }),
        ]);

        const json = (await response.json()) as {
          data: SearchDeputyItem[];
        };

        for (const item of json.data) {
          subscriber.next(
            profileUrl(item.codParlamentario, item.idLegislatura),
          );
        }

        // Emit profile URLs for inactive deputies via DiputadosDeBaja JSON.
        // Use page.evaluate to fetch within the browser context (bypasses WAF).
        const bajaLink = await page
          .locator('a[href*="DiputadosDeBaja"][href$="json"]')
          .getAttribute('href')
          .catch(() => null);

        if (bajaLink) {
          const bajaUrl = new URL(bajaLink, 'https://www.congreso.es').href;
          const bajaData = await page.evaluate(async (url: string) => {
            const response = await fetch(url);
            if (!response.ok) return [];
            return (await response.json()) as { codParlamentario: number }[];
          }, bajaUrl);

          for (const item of bajaData) {
            subscriber.next(profileUrl(item.codParlamentario, 15));
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

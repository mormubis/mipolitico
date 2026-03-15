import { Observable } from 'rxjs';

import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface DeputyItem {
  apellidos: string;
  apellidosNombre: string;
  codParlamentario: number;
  fchAlta: string;
  fchBaja: string;
  genero: number;
  grupo: string;
  idCircunscripcion: number;
  idLegislatura: number;
  nombre: string;
  nombreCircunscripcion: string;
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

        const json = (await response.json()) as { data: DeputyItem[] };

        for (const item of json.data) {
          subscriber.next(
            `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}`,
          );
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

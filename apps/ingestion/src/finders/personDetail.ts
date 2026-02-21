import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface DeputyItem {
  apellidos: string;
  apellidosNombre: string;
  codParlamentario: number;
  fchAlta: string;
  fchBaja: string;
  formacion: string;
  genero: number;
  grupo: string;
  idCircunscripcion: number;
  idLegislatura: number;
  nombre: string;
  nombreCircunscripcion: string;
}

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/diputados');

    const searchHref = await page
      .locator('a[href*="busqueda-de-diputados"][href*="statusOpendata"]')
      .first()
      .getAttribute('href');

    if (!searchHref) {
      throw new Error(
        '[personDetail] Could not find búsqueda personalizada link on opendata/diputados page',
      );
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
    const deputies = json.data;

    return deputies.map((item) => ({
      url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}&mostrarAgenda=false`,
      extra: item,
    }));
  } finally {
    await page.close();
  }
};

export type { DeputyItem };
export { finder };

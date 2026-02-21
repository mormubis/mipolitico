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

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/diputados');

    const href = await page
      .locator('a[href*="DiputadosActivos"][href$="json"]')
      .first()
      .getAttribute('href');

    if (!href) {
      throw new Error(
        'Could not find DiputadosActivos JSON link on opendata/diputados page',
      );
    }

    const url = new URL(href, 'https://www.congreso.es').href;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch DiputadosActivos JSON: ${response.status.toString()} ${response.statusText}`,
      );
    }

    const deputies = (await response.json()) as DeputyItem[];

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

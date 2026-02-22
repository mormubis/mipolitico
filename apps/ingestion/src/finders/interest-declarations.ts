import { romanize } from '../utils.ts';

import type { DeputyItem } from './person-detail.ts';
import type { Finder, Needle } from '../types.ts';

interface BulkDeclarationRow {
  NOMBRE: string;
  FECHAREGISTRO: string;
  DECLARACION: string;
  TIPO: string;
  PERIODO: string;
  EMPLEADOR: string;
  SECTOR: string;
  DESCRIPCION: string;
}

interface InterestDeclarationsNeedleExtra {
  codParlamentario: number;
  idLegislatura: number;
  declarations: BulkDeclarationRow[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/diputados');

    const [searchHref, declarationsHref] = await Promise.all([
      page
        .locator('a[href*="busqueda-de-diputados"][href*="statusOpendata"]')
        .first()
        .getAttribute('href'),
      page
        .locator('a[href*="docacteco"][href$="json"]')
        .first()
        .getAttribute('href'),
    ]);

    if (!searchHref) {
      throw new Error(
        '[interestDeclarations] Could not find búsqueda personalizada link on opendata/diputados page',
      );
    }

    if (!declarationsHref) {
      throw new Error(
        '[interestDeclarations] Could not find docacteco JSON link',
      );
    }

    const searchUrl = new URL(searchHref, 'https://www.congreso.es').href;
    const declarationsUrl = new URL(declarationsHref, 'https://www.congreso.es')
      .href;

    const declarationsResponsePromise = fetch(declarationsUrl).then((r) => {
      if (!r.ok) {
        throw new Error(
          `[interestDeclarations] Failed to fetch docacteco JSON: ${r.status.toString()} ${r.statusText}`,
        );
      }
      return r;
    });

    const [searchResponse, declarationsResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('searchDiputados') &&
          r.request().method() === 'POST',
        { timeout: 15000 },
      ),
      declarationsResponsePromise,
      page.goto(searchUrl, { waitUntil: 'networkidle' }),
    ]);

    const deputiesJson = (await searchResponse.json()) as {
      data: DeputyItem[];
    };
    const deputies = deputiesJson.data;
    const declarations =
      (await declarationsResponse.json()) as BulkDeclarationRow[];

    // Build lookup: normalized name → deputy
    const deputyByName = new Map<string, DeputyItem>();
    for (const deputy of deputies) {
      deputyByName.set(normalizeName(deputy.apellidosNombre), deputy);
    }

    // Group declaration rows by NOMBRE
    const rowsByName = new Map<string, BulkDeclarationRow[]>();
    for (const row of declarations) {
      const key = normalizeName(row.NOMBRE);
      const existing = rowsByName.get(key) ?? [];
      existing.push(row);
      rowsByName.set(key, existing);
    }

    const needles: Needle[] = [];

    for (const [normalizedName, rows] of rowsByName) {
      const deputy = deputyByName.get(normalizedName);

      if (!deputy) {
        console.warn(
          `[interestDeclarations] No deputy match for: ${rows[0]?.NOMBRE ?? normalizedName}`,
        );
        continue;
      }

      const extra: InterestDeclarationsNeedleExtra = {
        codParlamentario: deputy.codParlamentario,
        idLegislatura: deputy.idLegislatura,
        declarations: rows,
      };

      needles.push({
        url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${deputy.codParlamentario.toString()}&idLegislatura=${romanize(deputy.idLegislatura)}&mostrarAgenda=false`,
        extra,
      });
    }

    console.log(
      `[interestDeclarations] ${String(needles.length)} deputies matched out of ${String(rowsByName.size)} declaration groups`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkDeclarationRow, InterestDeclarationsNeedleExtra };
export { finder };

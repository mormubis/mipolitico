import type { Finder, Needle } from '../types.ts';

interface BulkInterventionRow {
  LEGISLATURA: string;
  OBJETOINICIATIVA: string;
  SESION: string; // DD/MM/YYYY
  ORGANO: string;
  FASE: string;
  TIPOINTERVENCION: string;
  ORADOR: string;
  CARGOORADOR: string;
  INICIOINTERVENCION: string;
  FININTERVENCION: string;
  ENLACEDIFERIDO: string;
  ENLACEDESCARGADIRECTA: string;
  ENLACETEXTOINTEGRO: string;
  ENLACEPDF: string;
}

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
      waitUntil: 'networkidle',
    });

    const href = await page
      .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
      .first()
      .getAttribute('href');

    if (!href) {
      throw new Error(
        '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
      );
    }

    const url = new URL(href, 'https://www.congreso.es').href;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `[intervention] Failed to fetch bulk JSON: ${response.status.toString()} ${response.statusText}`,
      );
    }

    const rows = (await response.json()) as BulkInterventionRow[];

    const seen = new Set<string>();
    const needles: Needle[] = [];

    for (const row of rows) {
      if (!row.ENLACETEXTOINTEGRO) continue;
      if (seen.has(row.ENLACETEXTOINTEGRO)) continue;

      seen.add(row.ENLACETEXTOINTEGRO);
      needles.push({ url: row.ENLACETEXTOINTEGRO, extra: row });
    }

    console.log(
      `[intervention] Found ${String(needles.length)} unique session pages`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkInterventionRow };
export { finder };

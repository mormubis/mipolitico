import { getLastSuccessfulRun } from '@congress/database';

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

const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date {
  const parts = ddmmyyyy.split('/');
  const dd = parts[0] ?? '01';
  const mm = parts[1] ?? '01';
  const yyyy = parts[2] ?? '1970';
  const date = new Date(`${yyyy}-${mm}-${dd}`);

  if (isNaN(date.getTime())) {
    console.warn(`[intervention] Could not parse date: ${ddmmyyyy}`);
    return new Date(0); // epoch — will be filtered out by watermark
  }

  return date;
}

const finder: Finder = async ({ browser, fetch }) => {
  const lastRun = await getLastSuccessfulRun('intervention');
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;

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
      const sessionDate = parseSpanishDate(row.SESION);

      if (sessionDate <= dateFrom) continue;
      if (!row.ENLACETEXTOINTEGRO) continue;
      if (seen.has(row.ENLACETEXTOINTEGRO)) continue;

      seen.add(row.ENLACETEXTOINTEGRO);
      needles.push({ url: row.ENLACETEXTOINTEGRO, extra: row });
    }

    console.log(
      `[intervention] Found ${String(needles.length)} unique session pages after ${dateFrom.toISOString().slice(0, 10)}`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkInterventionRow };
export { finder };

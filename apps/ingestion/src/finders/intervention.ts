import { getLastSuccessfulRun } from '@congress/database';

import type { Finder, Needle } from '../types.ts';

const MAX_PAGES = 200;
const LEGISLATURE_XV_START = new Date('2024-01-01');

const finder: Finder = async ({ browser }) => {
  const lastRun = await getLastSuccessfulRun('intervention');

  const today = new Date();
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;

  const formatDate = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };

  const page = await browser.newPage();
  const needles: Needle[] = [];

  try {
    const searchUrl = new URL(
      'https://www.congreso.es/es/busqueda-de-intervenciones',
    );
    searchUrl.searchParams.set('p_p_id', 'intervenciones');
    searchUrl.searchParams.set('p_p_lifecycle', '0');
    searchUrl.searchParams.set('_intervenciones_mode', 'busqueda');
    // TODO: Update legislature code when legislature XV ends
    searchUrl.searchParams.set('_intervenciones_legislatura', 'XV');
    searchUrl.searchParams.set(
      '_intervenciones_fecha_inicio',
      formatDate(dateFrom),
    );
    searchUrl.searchParams.set('_intervenciones_fecha_fin', formatDate(today));

    await page.goto(searchUrl.href, { waitUntil: 'networkidle' });

    let hasNextPage = true;
    let pageCount = 0;

    while (hasNextPage && pageCount < MAX_PAGES) {
      pageCount++;

      const links = await page
        .locator('a[href*="_intervenciones_id_texto"]')
        .all();

      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href) {
          const fullUrl = new URL(href, 'https://www.congreso.es').href;
          needles.push({ url: fullUrl });
        }
      }

      const nextLinkEl = page
        .locator(
          'a.next, a[title*="Siguiente"], a[aria-label*="Siguiente"], a[title*="siguiente"]',
        )
        .first();

      const nextHref = await nextLinkEl.getAttribute('href').catch(() => null);

      if (nextHref && nextHref.trim() !== '') {
        await page.goto(new URL(nextHref, 'https://www.congreso.es').href, {
          waitUntil: 'networkidle',
        });
      } else {
        hasNextPage = false;
      }
    }

    if (pageCount >= MAX_PAGES) {
      console.warn(
        '[intervention] Reached pagination limit; some sessions may be missed',
      );
    }
  } finally {
    await page.close();
  }

  return needles;
};

export { finder };

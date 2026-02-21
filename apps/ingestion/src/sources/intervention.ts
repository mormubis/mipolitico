import { getLastSuccessfulRun } from '@congress/database';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Finder, Needle, Retriever } from './types';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  ORDER: z.number(),
  SESSION_DATE: z.string(),
  SESSION_ID: z.string(),
  SESSION_TITLE: z.string(),
  SESSION_URL: z.string(),
  SPEAKER: z.string(),
  SPEAKER_NAME: z.string(),
  SPEAKER_ROLE: z.string().optional(),
  TEXT: z.string(),
});

const finder: Finder = async ({ browser }) => {
  const lastRun = await getLastSuccessfulRun('intervention');

  const today = new Date();
  const dateFrom = lastRun ?? new Date(0); // epoch for full sync

  // Format dates as DD/MM/YYYY (congreso.es format)
  const formatDate = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };

  const page = await browser.newPage();
  const needles: Needle[] = [];

  try {
    // Navigate to the interventions search with date filter
    const searchUrl = new URL(
      'https://www.congreso.es/es/busqueda-de-intervenciones',
    );
    searchUrl.searchParams.set('p_p_id', 'intervenciones');
    searchUrl.searchParams.set('p_p_lifecycle', '0');
    searchUrl.searchParams.set('_intervenciones_mode', 'busqueda');
    searchUrl.searchParams.set('_intervenciones_legislatura', 'XV');
    searchUrl.searchParams.set(
      '_intervenciones_fecha_inicio',
      formatDate(dateFrom),
    );
    searchUrl.searchParams.set('_intervenciones_fecha_fin', formatDate(today));

    await page.goto(searchUrl.href, { waitUntil: 'networkidle' });

    // Collect all session links across pages
    let hasNextPage = true;

    while (hasNextPage) {
      // Extract session links on current page
      // Each result links to: busqueda-de-intervenciones?..._intervenciones_id_texto=(CVE)
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

      // Check for a "next page" pagination link
      const nextLink = page
        .locator('a[href*="intervenciones"][href*="paginaActual"]')
        .last();

      const nextHref = await nextLink.getAttribute('href').catch(() => null);

      if (nextHref) {
        await page.goto(new URL(nextHref, 'https://www.congreso.es').href, {
          waitUntil: 'networkidle',
        });
      } else {
        hasNextPage = false;
      }
    }
  } finally {
    await page.close();
  }

  return needles;
};

const retriever: Retriever<Model> = ({ browser, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(url);

        // Extract session metadata
        const sessionIdRaw =
          (await page.locator('.datos2').textContent()) ?? '';
        const sessionTitleRaw =
          (await page.locator('.cabecera2').textContent()) ?? '';
        const sessionDateRaw =
          (await page.locator('.datos1').textContent()) ?? '';

        const sessionId = /cve:\s*(.+)/.exec(sessionIdRaw)?.[1] ?? '';
        const sessionDate =
          /\d{2}\/\d{2}\/\d{4}/.exec(sessionDateRaw)?.[0] ?? '';
        const sessionTitle = sessionTitleRaw.trim();

        // Get all text content
        const textContent = (await page.textContent('.textoIntegro')) ?? '';

        if (!textContent) {
          subscriber.complete();
          return;
        }

        // Split by speaker pattern
        const speakerPattern =
          /((?:El|La) señor[a]? [A-ZÁÉÍÓÚÑ\s]+(?:\([^)]+\))?:)/g;
        const parts = textContent.split(speakerPattern);

        // Parse each intervention
        let order = 0;
        for (let i = 1; i < parts.length; i += 2) {
          const speakerRaw = parts[i]?.replace(':', '').trim() ?? '';

          // Extract role if in parentheses
          const roleMatch = /\(([^)]+)\)/.exec(speakerRaw);
          const speakerName = speakerRaw
            .replace(/\([^)]+\)/, '')
            .replace(/^(El|La) señor[a]? /, '')
            .trim();

          const interventionText = parts[i + 1]?.trim() ?? '';

          if (interventionText) {
            subscriber.next({
              ORDER: order,
              SESSION_DATE: sessionDate,
              SESSION_ID: sessionId,
              SESSION_TITLE: sessionTitle,
              SESSION_URL: url,
              SPEAKER: speakerRaw,
              SPEAKER_NAME: speakerName,
              SPEAKER_ROLE: roleMatch?.[1],
              TEXT: interventionText,
            });
            order++;
          }
        }

        subscriber.complete();
      } catch (cause) {
        const error = new Error(
          `Unable to parse intervention from ${url}: ${(cause as Error).message}`,
          { cause },
        );
        subscriber.error(error);
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, finder, retriever };

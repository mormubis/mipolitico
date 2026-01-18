import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Finder, Retriever } from './types';

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

const finder: Finder = () => {
  // Return specific intervention session URLs
  // Can be extended later to auto-discover or accept config
  return 'https://www.congreso.es/en/busqueda-de-intervenciones?p_p_id=intervenciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_intervenciones_mode=mostrarTextoIntegro&_intervenciones_legislatura=XV&_intervenciones_id_texto=(DSCD-15-PL-28.CODI.)';
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

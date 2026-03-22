import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  order: z.number(),
  sessionDate: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  sessionUrl: z.string(),
  speaker: z.string(),
  speakerName: z.string(),
  speakerRole: z.string().optional(),
  text: z.string(),
});

const retriever: Retriever<Model> = ({ browser, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle' });

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

        const textContent = (await page.textContent('.textoIntegro')) ?? '';

        if (!textContent) {
          subscriber.complete();
          return;
        }

        // Matches speaker announcements like "El señor PRESIDENTE DEL GOBIERNO (Sánchez):"
        // Requires the name to start with 2+ uppercase characters to avoid matching
        // mid-sentence references like "el señor Feijóo" (mixed case).
        const speakerPattern =
          /((?:El|La) señor[a]? [A-ZÁÉÍÓÚÑ]{2}[A-ZÁÉÍÓÚÑ\s]*(?:\([^)]+\))?:)/g;
        const parts = textContent.split(speakerPattern);

        let order = 0;
        for (let i = 1; i < parts.length; i += 2) {
          const speakerRaw = parts[i]?.replace(':', '').trim() ?? '';
          const roleMatch = /\(([^)]+)\)/.exec(speakerRaw);
          const speakerName = speakerRaw
            .replace(/\([^)]+\)/, '')
            .replace(/^(El|La) señor[a]? /, '')
            .trim();

          const interventionText = parts[i + 1]?.trim() ?? '';

          if (interventionText) {
            subscriber.next({
              order,
              sessionDate,
              sessionId,
              sessionTitle,
              sessionUrl: url,
              speaker: speakerRaw,
              speakerName,
              speakerRole: roleMatch?.[1],
              text: interventionText,
            });
            order++;
          }
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(cause as Error).message}`, {
            cause,
          }),
        );
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };

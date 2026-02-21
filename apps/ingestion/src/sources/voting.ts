import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Finder, Retriever } from './types';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  // Session metadata
  LEGISLATURE: z.number(),
  SESSION_NUMBER: z.number(),
  VOTING_NUMBER: z.number(),
  VOTING_DATE: z.string(),
  VOTING_TITLE: z.string(),
  VOTING_DESCRIPTION: z.string(),

  // Vote totals (denormalized for analytics)
  BY_ASSENT: z.boolean(),
  TOTAL_PRESENT: z.number(),
  TOTAL_FOR: z.number(),
  TOTAL_AGAINST: z.number(),
  TOTAL_ABSTENTION: z.number(),
  TOTAL_NO_VOTE: z.number(),

  // Individual deputy vote
  DEPUTY_SEAT: z.string(),
  DEPUTY_NAME: z.string(),
  DEPUTY_GROUP: z.string(),
  VOTE: z.string(),

  // Source tracking
  JSON_URL: z.string(),
});

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();
  const needles = [];

  try {
    await page.goto('https://www.congreso.es/es/opendata/votaciones', {
      waitUntil: 'networkidle',
    });

    // Expand all voting sections to reveal JSON links
    const sections = await page.locator('h4[role="button"]').all();
    for (const section of sections) {
      await section.click();
      // Small delay to allow section to expand
      await page.waitForTimeout(300);
    }

    // Extract all JSON links
    const jsonLinks = await page.locator('a[href$=".json"]').all();

    for (const link of jsonLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        // Extract legislature and session from URL pattern: Leg{LEG}/Sesion{SESSION}
        const match = /Leg(\d+)\/Sesion(\d+)/.exec(href);
        needles.push({
          url: href,
          extra: {
            legislature: match?.[1] ? parseInt(match[1], 10) : null,
            session: match?.[2] ? parseInt(match[2], 10) : null,
          },
        });
      }
    }

    return needles;
  } finally {
    await page.close();
  }
};

const retriever: Retriever<Model> = ({ fetch, url, extra }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      try {
        // 1. Fetch JSON file
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `HTTP ${String(response.status)}: ${response.statusText}`,
          );
        }

        // 2. Parse JSON
        const votingData = (await response.json()) as {
          informacion: {
            legislatura: number;
            sesion: number;
            numeroVotacion: number;
            fecha: string;
            titulo: string;
            textoExpediente: string;
          } & Record<string, unknown>;
          totales: {
            asentimiento: string;
            presentes: number;
            afavor: number;
            enContra: number;
            abstenciones: number;
            noVotan: number;
          } & Record<string, unknown>;
          votaciones: ({
            asiento: string;
            diputado: string;
            grupo: string;
            voto: string;
          } & Record<string, unknown>)[];
        };

        // 3. Emit one record per deputy vote
        for (const vote of votingData.votaciones) {
          const record = {
            // Map JSON structure to schema
            LEGISLATURE:
              (extra as { legislature?: number | null } | undefined)
                ?.legislature ?? votingData.informacion.legislatura,
            SESSION_NUMBER: votingData.informacion.sesion,
            VOTING_NUMBER: votingData.informacion.numeroVotacion,
            VOTING_DATE: votingData.informacion.fecha,
            VOTING_TITLE: votingData.informacion.titulo,
            VOTING_DESCRIPTION: votingData.informacion.textoExpediente,

            BY_ASSENT: votingData.totales.asentimiento === 'Sí',
            TOTAL_PRESENT: votingData.totales.presentes,
            TOTAL_FOR: votingData.totales.afavor,
            TOTAL_AGAINST: votingData.totales.enContra,
            TOTAL_ABSTENTION: votingData.totales.abstenciones,
            TOTAL_NO_VOTE: votingData.totales.noVotan,

            DEPUTY_SEAT: (vote as Record<string, unknown>).asiento as string,
            DEPUTY_NAME: (vote as Record<string, unknown>).diputado as string,
            DEPUTY_GROUP: (vote as Record<string, unknown>).grupo as string,
            VOTE: (vote as Record<string, unknown>).voto as string,

            JSON_URL: url,
          };

          // Validate and emit
          subscriber.next(Schema.parse(record));
        }

        subscriber.complete();
      } catch (error) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(error as Error).message}`, {
            cause: error,
          }),
        );
      }
    })();
  });
};

export type { Model };
export { Schema, finder, retriever };

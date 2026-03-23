import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  byAssent: z.boolean(),
  deputyGroup: z.string(),
  deputyName: z.string(),
  deputySeat: z.string(),
  jsonUrl: z.string(),
  legislature: z.number(),
  sessionNumber: z.number(),
  totalAbstention: z.number(),
  totalAgainst: z.number(),
  totalFor: z.number(),
  totalNoVote: z.number(),
  totalPresent: z.number(),
  vote: z.string(),
  votingDate: z.string(),
  votingDescription: z.string(),
  votingNumber: z.number(),
  votingTitle: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url, validationMode }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `HTTP ${String(response.status)}: ${response.statusText}`,
          );
        }

        const votingData = (await response.json()) as {
          informacion: {
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

        // Extract legislature number from URL path (e.g. .../Leg15/... → 15)
        const legMatch = /\/Leg(\d+)\//.exec(url);
        const legislature = legMatch ? parseInt(legMatch[1] ?? '0', 10) : 0;

        for (const vote of votingData.votaciones) {
          const record = {
            byAssent: votingData.totales.asentimiento === 'Sí',
            deputyGroup: vote.grupo,
            deputyName: vote.diputado,
            deputySeat: vote.asiento,
            jsonUrl: url,
            legislature,
            sessionNumber: votingData.informacion.sesion,
            totalAbstention: votingData.totales.abstenciones,
            totalAgainst: votingData.totales.enContra,
            totalFor: votingData.totales.afavor,
            totalNoVote: votingData.totales.noVotan,
            totalPresent: votingData.totales.presentes,
            vote: vote.voto,
            votingDate: votingData.informacion.fecha,
            votingDescription: votingData.informacion.textoExpediente,
            votingNumber: votingData.informacion.numeroVotacion,
            votingTitle: votingData.informacion.titulo,
          };

          const parsed = validate(Schema, validationMode)(record, url);
          if (parsed) subscriber.next(parsed);
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(cause as Error).message}`, {
            cause,
          }),
        );
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };

import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  LEGISLATURE: z.number(),
  SESSION_NUMBER: z.number(),
  VOTING_NUMBER: z.number(),
  VOTING_DATE: z.string(),
  VOTING_TITLE: z.string(),
  VOTING_DESCRIPTION: z.string(),
  BY_ASSENT: z.boolean(),
  TOTAL_PRESENT: z.number(),
  TOTAL_FOR: z.number(),
  TOTAL_AGAINST: z.number(),
  TOTAL_ABSTENTION: z.number(),
  TOTAL_NO_VOTE: z.number(),
  DEPUTY_SEAT: z.string(),
  DEPUTY_NAME: z.string(),
  DEPUTY_GROUP: z.string(),
  VOTE: z.string(),
  JSON_URL: z.string(),
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

        for (const vote of votingData.votaciones) {
          const record = {
            LEGISLATURE: votingData.informacion.legislatura,
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

          const parsed = validate(Schema, validationMode)(record, url);
          if (parsed) subscriber.next(parsed);
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
export { Schema, retriever };

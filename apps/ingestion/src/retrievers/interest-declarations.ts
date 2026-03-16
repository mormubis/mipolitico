import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  BENEFACTOR: z.string().optional(),
  DECLARACION: z.string(),
  DESCRIPCION: z.string().optional(),
  DESTINATARIO: z.string().optional(),
  EMPLEADOR: z.string().optional(),
  FECHAREGISTRO: z.string(),
  NOMBRE: z.string(),
  OBSERVACIONES: z.string().optional(),
  PERIODO: z.string().optional(),
  SECTOR: z.string().optional(),
  TIPO: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url, validationMode }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch interest declarations data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from interest declarations endpoint',
          );
        }

        const parser = validate(Schema, validationMode);

        oboe(Readable.fromWeb(response.body))
          .node('!.*', (item) => {
            const record = parser(item, url);
            if (record) subscriber.next(record);
          })
          .done(() => {
            subscriber.complete();
          })
          .fail((error) => {
            subscriber.error(error);
          });
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

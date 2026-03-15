import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  Cargo: z.string(),
  FechaAlta: z.string(),
  FechaBaja: z.string(),
  Grupo: z.string(),
  Nombre: z.string(),
  NombreOrgano: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url, validationMode }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url, { method: 'POST' });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch bureau data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from bureau data endpoint',
          );
        }

        const parser = validate(Schema, validationMode);

        oboe(Readable.fromWeb(response.body))
          .node('data.*', (item) => {
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

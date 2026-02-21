import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

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

const retriever: Retriever<Model> = ({ fetch, url }) => {
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

        oboe(Readable.fromWeb(response.body))
          .node('data.*', (item) => {
            subscriber.next(item as Model);
          })
          .done(() => {
            subscriber.complete();
          })
          .fail((error) => {
            subscriber.error(error);
          });
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };

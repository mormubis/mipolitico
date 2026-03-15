import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  CARGOORADOR: z.string(),
  ENLACEDESCARGADIRECTA: z.string(),
  ENLACEDIFERIDO: z.string(),
  ENLACEPDF: z.string(),
  ENLACETEXTOINTEGRO: z.string(),
  FININTERVENCION: z.string(),
  INICIOINTERVENCION: z.string(),
  LEGISLATURA: z.string(),
  OBJETOINICIATIVA: z.string(),
  ORADOR: z.string(),
  ORGANO: z.string(),
  SESION: z.string(),
  TIPOINTERVENCION: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url, validationMode }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch intervention data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from intervention data endpoint',
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

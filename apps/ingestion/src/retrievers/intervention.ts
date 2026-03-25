import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z
  .object({
    CARGOORADOR: z.string().optional(),
    ENLACEDESCARGADIRECTA: z.string().optional(),
    ENLACEDIFERIDO: z.string().optional(),
    ENLACEPDF: z.string().optional(),
    ENLACETEXTOINTEGRO: z.string(),
    FININTERVENCION: z.string().optional(),
    INICIOINTERVENCION: z.string().optional(),
    LEGISLATURA: z.string(),
    OBJETOINICIATIVA: z.string().optional(),
    ORADOR: z.string().optional(),
    ORGANO: z.string().optional(),
    SESION: z.string(),
    TIPOINTERVENCION: z.string().optional(),
  })
  .transform((raw) => ({
    ...raw,
    pageAnchor: (() => {
      const fragment = raw.ENLACETEXTOINTEGRO.split('#')[1];
      if (!fragment) return null;
      const decoded = decodeURIComponent(fragment);
      const match = /\(Página(\d+)\)/i.exec(decoded);
      return match?.[1] !== undefined ? parseInt(match[1], 10) : null;
    })(),
  }));

const retriever: Retriever<Model> = ({
  fetch,
  url,
  validationMode,
  sourceName,
}) => {
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
            const record = parser(item, sourceName, url);
            subscriber.next(record as Model);
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

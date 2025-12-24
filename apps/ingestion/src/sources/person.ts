import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Finder, Retriever } from './types';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  BIOGRAFIA: z.string(),
  CIRCUNSCRIPCION: z.string(),
  FECHAALTA: z.string(),
  FECHAALTAENGRUPOPARLAMENTARIO: z.string(),
  FECHACONDICIONPLENA: z.string(),
  FORMACIONELECTORAL: z.string(),
  GRUPOPARLAMENTARIO: z.string(),
  NOMBRE: z.string(),
});

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('https://www.congreso.es/es/opendata/diputados');

  // Look for the latest deputies file in JSON format
  const link = await page
    .locator('a[href*=DiputadosActivos][href$=json]')
    .getAttribute('href');

  if (!link) {
    throw new Error(
      'Could not find link to active deputies JSON data on the congress page',
    );
  }

  const url = new URL(link, 'https://www.congreso.es');

  await page.close();

  return url.href;
};

const retriever: Retriever<Model> = ({ fetch, url }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch person data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from person data endpoint',
          );
        }

        oboe(Readable.fromWeb(response.body))
          .node('!.*', (item) => {
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
export { Schema, finder, retriever };

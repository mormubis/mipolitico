import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Finder, Retriever } from './types';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  Cargo: z.string(),
  FechaAlta: z.string(),
  FechaBaja: z.string(),
  Grupo: z.string(),
  Nombre: z.string(),
  NombreOrgano: z.string(),
});

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  // Open data website
  await page.goto('https://www.congreso.es/es/opendata/organos');

  // Navigate to the bureau page
  await Promise.all([
    page.waitForEvent('load'),
    page.getByText('Exportar datos composición').first().click(),
  ]);

  // We want all the details
  const [request] = await Promise.all([
    page.waitForEvent('requestfinished', { timeout: 3000 }),
    page.getByText('Composición histórica').first().click(),
  ]);

  // Get the request url
  const url = request.url();

  // Close the page
  await page.close();

  return url;
};

const retriever: Retriever<Model> = ({ fetch, url }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url, { method: 'POST' });

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
export { Schema, finder, retriever };

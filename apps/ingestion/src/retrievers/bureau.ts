import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

// The JSON export uses Spanish PascalCase field names matching the original API.
const Schema = z
  .object({
    Cargo: z.string(),
    FechaAlta: z.string(),
    FechaBaja: z.string(),
    Grupo: z.string(),
    Nombre: z.string(),
    NombreOrgano: z.string(),
  })
  .transform((raw) => ({
    endDate: raw.FechaBaja,
    group: raw.Grupo,
    name: raw.Nombre,
    organName: raw.NombreOrgano,
    position: raw.Cargo,
    startDate: raw.FechaAlta,
  }));

const retriever: Retriever<Model> = ({ browser, url, validationMode }) => {
  return new Observable((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle' });

        // Click JSON export button and intercept the POST response
        const [response] = await Promise.all([
          page.waitForResponse(
            (r) => r.url().includes('opendataExport') && r.status() === 200,
          ),
          page.getByRole('button', { name: 'JSON' }).click(),
        ]);

        const body = await response.body();
        const parser = validate(Schema, validationMode);

        // JSON export is a flat object with numeric keys: { "0": {...}, "1": {...} }
        oboe(Readable.from(body))
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
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };

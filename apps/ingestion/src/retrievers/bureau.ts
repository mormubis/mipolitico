import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { validate } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  endDate: z.string(),
  group: z.string(),
  name: z.string(),
  organName: z.string(),
  position: z.string(),
  startDate: z.string(),
});

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

        oboe(Readable.from(body))
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
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };

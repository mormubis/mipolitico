import { InitiativeInputSchema } from '@congress/database';
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';

import type { Retriever } from '../types.ts';
import type { InitiativeInput } from '@congress/database';
// TODO: Update legislature number when legislature XV ends (same as intervention/finder.ts)
const CURRENT_LEGISLATURE = 15;

const retriever: Retriever<InitiativeInput> = ({
  fetch,
  url,
  validationMode,
}) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch initiatives data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from initiatives endpoint',
          );
        }

        oboe(Readable.fromWeb(response.body))
          .node('!.*', (item: unknown) => {
            const result = InitiativeInputSchema.safeParse({
              ...(item as Record<string, unknown>),
              LEGISLATURE: CURRENT_LEGISLATURE,
            });
            if (result.success) {
              subscriber.next(result.data);
            } else if (validationMode === 'strict') {
              throw result.error;
            } else {
              console.warn(
                `[validate] Skipping invalid record from ${url}: ${result.error.message}`,
              );
            }
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

export { retriever };

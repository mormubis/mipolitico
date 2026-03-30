import { InitiativeInputSchema, InitiativeType } from '@congress/database';
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';

import { CURRENT_LEGISLATURE } from '../config/legislature.ts';

import type { Retriever } from '../types.ts';
import type { InitiativeInput } from '@congress/database';

const TIPO_MAP: Record<string, string> = {
  'Leyes': InitiativeType.LAW,
  'Leyes organicas': InitiativeType.ORGANIC_LAW,
  'Leyes orgánicas': InitiativeType.ORGANIC_LAW,
  'Reales decretos': InitiativeType.ROYAL_DECREE,
  'Proyecto de ley': InitiativeType.BILL,
  'Proposición de ley de Diputados': InitiativeType.PRIVATE_MEMBER_BILL,
  'Proposición de ley de Grupos Parlamentarios del Congreso':
    InitiativeType.PARLIAMENTARY_GROUP_BILL,
  'Proposición de ley de Comunidades y Ciudades Autónomas':
    InitiativeType.AUTONOMOUS_COMMUNITY_BILL,
  'Proposición de ley del Senado': InitiativeType.SENATE_BILL,
  'Propuesta de reforma de Estatuto de Autonomía':
    InitiativeType.STATUTE_REFORM,
};

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
            const raw = item as Record<string, unknown>;
            // Map Spanish UPPERCASE JSON fields to camelCase schema fields
            const result = InitiativeInputSchema.safeParse({
              bulletinDate: raw.FECHA_BOLETIN,
              bulletinNumber: raw.NUMERO_BOLETIN,
              currentStatus: raw.SITUACIONACTUAL,
              fileNumber: raw.NUMEXPEDIENTE,
              lawDate: raw.FECHA_LEY,
              lawNumber: raw.NUMERO_LEY,
              lawTitle: raw.TITULO_LEY,
              legislature: CURRENT_LEGISLATURE,
              pdf: raw.PDF,
              presentationDate: raw.FECHAPRESENTACION,
              processingResult: raw.RESULTADOTRAMITACION,
              subject: raw.OBJETO,
              type: TIPO_MAP[raw.TIPO as string] ?? raw.TIPO,
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

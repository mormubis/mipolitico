import { prisma } from '@congress/database';
import { EMPTY, from, mergeMap, scan } from 'rxjs';


import type { Model as DetailModel } from '../retrievers/intervention-detail.ts';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { InterventionInput } from '@congress/database';

// Key: sessionUrl (fragment-stripped from ENLACETEXTOINTEGRO)
// Value: array of bulk metadata rows for that session
type MetadataMap = Map<string, BulkModel[]>;

interface AccState {
  map: MetadataMap;
  ready: InterventionInput[];
}

function isBulkModel(record: unknown): record is BulkModel {
  return (
    typeof record === 'object' &&
    record !== null &&
    'ENLACETEXTOINTEGRO' in record &&
    'ORADOR' in record
  );
}

function isDetailModel(record: unknown): record is DetailModel {
  return (
    typeof record === 'object' &&
    record !== null &&
    'sessionId' in record &&
    'text' in record &&
    'sessionUrl' in record &&
    'speakerName' in record
  );
}

const processor: Processor<unknown, InterventionInput> = (source$) =>
  source$.pipe(
    scan(
      (acc: AccState, record: unknown): AccState => {
        if (isBulkModel(record)) {
          // Accumulate bulk metadata by session URL (strip fragment)
          const url = record.ENLACETEXTOINTEGRO.split('#')[0];
          if (!url) {
            console.warn(
              '[intervention] Skipping bulk row with empty ENLACETEXTOINTEGRO',
            );
            return { map: acc.map, ready: [] };
          }
          const existing = acc.map.get(url) ?? [];
          acc.map.set(url, [...existing, record]);
          return { map: acc.map, ready: [] };
        }

        if (isDetailModel(record)) {
          // Match against accumulated bulk metadata by speaker name
          const bulkRows = acc.map.get(record.sessionUrl) ?? [];
          const match = bulkRows.find(
            (row) =>
              row.ORADOR.trim().toLowerCase() ===
              record.speakerName.trim().toLowerCase(),
          );

          const enriched: InterventionInput = {
            endTime: match?.FININTERVENCION,
            initiativeSubject: match?.OBJETOINICIATIVA,
            interventionType: match?.TIPOINTERVENCION,
            order: record.order,
            organ: match?.ORGANO,
            sessionDate: record.sessionDate,
            sessionId: record.sessionId,
            sessionTitle: record.sessionTitle,
            sessionUrl: record.sessionUrl,
            speaker: record.speaker,
            speakerName: record.speakerName,
            speakerRole: record.speakerRole,
            startTime: match?.INICIOINTERVENCION,
            text: record.text,
            videoDownloadUrl: match?.ENLACEDESCARGADIRECTA,
            videoUrl: match?.ENLACEDIFERIDO,
          };

          return { map: acc.map, ready: [enriched] };
        }

        // Unknown record shape — skip silently
        return { map: acc.map, ready: [] };
      },
      { map: new Map(), ready: [] },
    ),
    mergeMap(({ ready }) => (ready.length > 0 ? from(ready) : EMPTY)),
    mergeMap(async (enriched) => {
      const person = await prisma.person.findFirst({
        where: { name: { contains: enriched.speakerName } },
        select: { id: true },
      });
      return { ...enriched, personId: person?.id };
    }),
  );

export { processor };

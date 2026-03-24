import { prisma } from '@congress/database';
import { EMPTY, from, mergeMap, scan } from 'rxjs';

import { NAME_OVERRIDES } from '../config/name-overrides.ts';
import { normalizeSpanishName } from '../utils.ts';

import type { Model as DetailModel } from '../retrievers/intervention-detail.ts';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { InterventionInput } from '@congress/database';

// Lazy-loaded lookup map: normalised name key → Person.id
// Built on first use to avoid repeated DB queries across all interventions.
let personLookup: Map<string, string> | null = null;

// Ordering assumption: bulk metadata records (intervention source) must arrive
// before their matching detail records (intervention-detail source) for enrichment
// to work. This is naturally guaranteed in practice because:
// - intervention: fetches a single JSON file via oboe (~seconds, no Playwright)
// - intervention-detail: scrapes ~200+ HTML pages via Playwright (~minutes)
// If a detail record arrives before its bulk rows, it still emits — just without
// optional enrichment fields (videoUrl, organ, etc.). The text content is preserved.
//
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
    'LEGISLATURA' in record
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
              (row.ORADOR ?? '').trim().toLowerCase() ===
              record.speakerName.trim().toLowerCase(),
          );

          // Prefer the bulk JSON ORADOR for the canonical speaker name —
          // it uses "Surname, Name" format matching Person.name exactly.
          // Strip the parliamentary group suffix "(GS)", "(GPP)", etc.
          const canonicalName = match?.ORADOR
            ? match.ORADOR.replace(/\s*\([^)]+\)\s*$/, '').trim()
            : record.speakerName;

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
            speakerName: canonicalName,
            speakerRole: match?.CARGOORADOR ?? record.speakerRole,
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
      // Build a normalised lookup map from all Person records on first call.
      // This avoids repeated DB queries and handles Spanish name variants:
      // particles (de/del), hyphens, accents, Catalan connectors.
      if (!personLookup) {
        const persons = await prisma.person.findMany({
          select: { id: true, name: true },
        });
        personLookup = new Map(
          persons.map((p) => [normalizeSpanishName(p.name), p.id]),
        );
      }

      // Check static overrides first for known transcription errors
      const overrideName = NAME_OVERRIDES[enriched.speakerName];
      const key = overrideName
        ? normalizeSpanishName(overrideName)
        : normalizeSpanishName(enriched.speakerName);
      const personId = personLookup.get(key);
      return { ...enriched, personId };
    }),
  );

export { processor };

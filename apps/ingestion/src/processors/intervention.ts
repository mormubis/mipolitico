import { EMPTY, from, map, mergeMap, scan, withLatestFrom } from 'rxjs';

import { NAME_OVERRIDES } from '../corrections/name-overrides.ts';
import { normalizeSpanishName } from '../utils.ts';

import type { Model as DetailModel } from '../retrievers/intervention-detail.ts';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { InterventionInput } from '@congress/database';

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
  used: Set<string>; // "sessionUrl:bulkIndex" → consumed
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

const processor: Processor<unknown, InterventionInput> = (ctx) => (source$) =>
  source$.pipe(
    // Phase 1: scan accumulation
    scan(
      (acc: AccState, record: unknown): AccState => {
        if (isBulkModel(record)) {
          // Accumulate bulk metadata by session URL (strip fragment)
          const url = record.ENLACETEXTOINTEGRO.split('#')[0];
          if (!url) {
            console.warn(
              '[intervention] Skipping bulk row with empty ENLACETEXTOINTEGRO',
            );
            return { map: acc.map, used: acc.used, ready: [] };
          }
          const existing = acc.map.get(url) ?? [];
          acc.map.set(url, [...existing, record]);
          return { map: acc.map, used: acc.used, ready: [] };
        }

        if (isDetailModel(record)) {
          const bulkRows = acc.map.get(record.sessionUrl) ?? [];

          // Two-tier matching:
          // Tier 1: name-based — normalized speaker name contains first bulk ORADOR word
          const normalizedHtmlSpeaker = normalizeSpanishName(
            record.speakerName,
          );
          const htmlFirstWord = normalizedHtmlSpeaker.split(' ')[0] ?? '';

          let matchIdx = -1;

          if (htmlFirstWord.length >= 3) {
            // Try name match first (must not be already consumed)
            matchIdx = bulkRows.findIndex((row, idx) => {
              if (acc.used.has(`${record.sessionUrl}:${String(idx)}`)) {
                return false;
              }
              const normalizedOrador = normalizeSpanishName(
                (row.ORADOR ?? '').replace(/\s*\([^)]+\)\s*$/, '').trim(),
              );
              const oradorFirstWord = normalizedOrador.split(' ')[0] ?? '';
              return (
                normalizedOrador.includes(htmlFirstWord) ||
                (oradorFirstWord.length >= 3 &&
                  htmlFirstWord.includes(oradorFirstWord))
              );
            });
          }

          // Tier 2: order-based fallback — next unconsumed bulk row for this session
          if (matchIdx === -1) {
            matchIdx = bulkRows.findIndex(
              (_, idx) => !acc.used.has(`${record.sessionUrl}:${String(idx)}`),
            );
          }

          const match = matchIdx >= 0 ? bulkRows[matchIdx] : undefined;

          // Mark as consumed
          if (matchIdx >= 0) {
            acc.used.add(`${record.sessionUrl}:${String(matchIdx)}`);
          }

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
            procedural: record.procedural,
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

          return { map: acc.map, used: acc.used, ready: [enriched] };
        }

        // Unknown record shape — skip silently
        return { map: acc.map, used: acc.used, ready: [] };
      },
      { map: new Map(), ready: [], used: new Set<string>() },
    ),
    mergeMap(({ ready }) => (ready.length > 0 ? from(ready) : EMPTY)),
    // Phase 2: enrich via side inputs (replaces DB queries)
    withLatestFrom(ctx.personMap$, ctx.governmentMemberMap$),
    map(([enriched, personMap, govMap]) => {
      const overrideName = NAME_OVERRIDES[enriched.speakerName];
      const key = overrideName
        ? normalizeSpanishName(overrideName)
        : normalizeSpanishName(enriched.speakerName);
      let personId: string | undefined = personMap.get(key);

      if (!personId && enriched.speakerRole) {
        const overrideFromRole = NAME_OVERRIDES[enriched.speakerRole];
        const roleKey = overrideFromRole
          ? normalizeSpanishName(overrideFromRole)
          : normalizeSpanishName(enriched.speakerRole);
        personId = personMap.get(roleKey);
      }

      let governmentMemberId: string | undefined;
      if (enriched.speakerRole?.trim() && personId) {
        const normalizedRole = enriched.speakerRole.trim().toLowerCase();
        governmentMemberId = govMap.get(`${personId}::${normalizedRole}`);
      }

      return { ...enriched, personId, governmentMemberId };
    }),
  );

export { processor };

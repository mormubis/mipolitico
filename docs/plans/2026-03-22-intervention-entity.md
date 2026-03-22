# Intervention Entity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Replace the `Speech` model with `Intervention`, wire the bulk JSON
metadata pipeline and the HTML detail pipeline through a processor that merges
both streams before storing complete records.

**Architecture:** The `intervention` retriever emits one metadata row per
speaker from the bulk JSON (fast, no Playwright). The `intervention-detail`
retriever scrapes each session HTML page and emits one record per speaker with
`text`. A processor accumulates bulk metadata into a lookup map (keyed by
`sessionUrl + speakerName`), then enriches each HTML record as it arrives. Only
complete records (metadata + text) reach the sink.

**Tech Stack:** Prisma (SQLite), Zod, RxJS (`mergeMap`, `scan`, `EMPTY`, `of`),
Playwright, `oboe` streaming, TypeScript.

---

### Task 1: Rename `Speech` → `Intervention` in Prisma schema

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Replace the `Speech` model**

Replace the entire `Speech` model with `Intervention`. Add the new metadata
fields from the bulk JSON. Keep `text` required.

```prisma
/// Represents a parliamentary intervention (speech) in a session.
/// Metadata comes from the bulk intervention JSON (intervention pipeline).
/// Text content comes from the HTML session transcript (intervention-detail pipeline).
/// Both sources are merged in a processor before storage — no partial records.
///
/// Data source: intervention.ts + intervention-detail.ts scrapers
model Intervention {
  id              String   @id @default(cuid())
  /// Optional reference to Person. Null until entity resolution matches speaker name.
  personId        String?
  /// Session identifier derived from the transcript URL (e.g. "DSCD-15-PL-1.CODI.").
  sessionId       String
  /// Date of the parliamentary session.
  sessionDate     DateTime
  /// Title or topic of the session.
  sessionTitle    String
  /// URL to the original session transcript page (without fragment).
  sessionUrl      String
  /// Raw speaker text as extracted from source (e.g. "El señor GARCÍA GARCÍA:").
  speakerRaw      String
  /// Parsed speaker name. Used for Person reconciliation.
  speakerName     String
  /// Speaker role or title (e.g. "Presidente", "Diputado"). Null if not specified.
  speakerRole     String?
  /// Full text of the intervention.
  text            String
  /// Sequential order within the session.
  orderInSession  Int
  /// Parliamentary organ where the intervention took place.
  organ           String?
  /// Description of the initiative being discussed.
  initiativeSubject String?
  /// Intervention type (e.g. "Intervención", "Réplica").
  interventionType  String?
  /// Start time of the intervention (HH:MM:SS format from bulk JSON).
  startTime       String?
  /// End time of the intervention (HH:MM:SS format from bulk JSON).
  endTime         String?
  /// URL to deferred video recording.
  videoUrl        String?
  /// URL to direct video download.
  videoDownloadUrl String?
  /// Timestamp of record creation.
  createdAt       DateTime @default(now())
  /// Timestamp of last record update.
  updatedAt       DateTime @updatedAt

  /// Linked entities.
  person          Person?  @relation(fields: [personId], references: [id])

  /// Ensures one intervention record per session order.
  @@unique([sessionId, orderInSession])
}
```

**Step 2: Remove the old `Speech` model entirely**

Delete the `Speech` model from the schema. Also update `Person` relation —
remove `speeches Speech[]`, add `interventions Intervention[]`.

**Step 3: Generate migration**

```bash
pnpm --filter @congress/database exec prisma migrate dev --name rename_speech_to_intervention
```

Expected: migration file created, database updated.

**Step 4: Regenerate Prisma client**

```bash
pnpm --filter @congress/database exec prisma generate
```

**Step 5: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(database): rename Speech to Intervention, add metadata fields"
```

---

### Task 2: Update `InterventionInputSchema` in database validation

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Replace `SpeechInputSchema` with `InterventionInputSchema`**

```typescript
export const InterventionInputSchema = z.object({
  deputyId: z.string().optional(), // resolved by processor, null until matched
  endTime: z.string().optional(),
  initiativeSubject: z.string().optional(),
  interventionType: z.string().optional(),
  order: z.number(),
  organ: z.string().optional(),
  personId: z.string().optional(),
  sessionDate: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  sessionUrl: z.string(),
  speaker: z.string(),
  speakerName: z.string(),
  speakerRole: z.string().optional(),
  startTime: z.string().optional(),
  text: z.string(),
  videoDownloadUrl: z.string().optional(),
  videoUrl: z.string().optional(),
});
export type InterventionInput = z.infer<typeof InterventionInputSchema>;
```

**Step 2: Remove `SpeechInputSchema` and `SpeechInput`**

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

Expected: errors for repositories/sinks that still reference `Speech` — fix in
next tasks.

**Step 4: Commit**

```bash
git add packages/database/src/validation/
git commit -m "feat(database): add InterventionInputSchema, remove SpeechInputSchema"
```

---

### Task 3: Replace `speeches` repository with `interventions`

**Files:**

- Create: `packages/database/src/repositories/interventions.ts`
- Delete: `packages/database/src/repositories/speeches.ts`
- Modify: `packages/database/src/repositories/index.ts`

**Step 1: Create `interventions.ts`**

```typescript
import { prisma } from '../client.ts';
import { InterventionInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InterventionInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  const parts = dateStr.split('/').map(Number);
  const [day, month, year] = parts;
  if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year))
    return null;
  return new Date(year, month - 1, day);
}

export async function upsertInterventions(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const valid: InterventionInput[] = [];
  for (const record of records) {
    const result = InterventionInputSchema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      logValidationError('interventions', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of valid) {
      const sessionDate = parseSpanishDate(data.sessionDate);
      if (!sessionDate) {
        skipped++;
        continue;
      }

      const person = await tx.person.findFirst({
        where: { name: { contains: data.speakerName } },
      });

      await tx.intervention.upsert({
        where: {
          sessionId_orderInSession: {
            sessionId: data.sessionId,
            orderInSession: data.order,
          },
        },
        create: {
          personId: person?.id ?? null,
          sessionId: data.sessionId,
          sessionDate,
          sessionTitle: data.sessionTitle,
          sessionUrl: data.sessionUrl,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
          orderInSession: data.order,
          organ: data.organ ?? null,
          initiativeSubject: data.initiativeSubject ?? null,
          interventionType: data.interventionType ?? null,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          videoUrl: data.videoUrl ?? null,
          videoDownloadUrl: data.videoDownloadUrl ?? null,
        },
        update: {
          personId: person?.id ?? null,
          sessionDate,
          sessionTitle: data.sessionTitle,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
          organ: data.organ ?? null,
          initiativeSubject: data.initiativeSubject ?? null,
          interventionType: data.interventionType ?? null,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          videoUrl: data.videoUrl ?? null,
          videoDownloadUrl: data.videoDownloadUrl ?? null,
        },
      });
      success++;
    }
  });

  return { success, skipped };
}
```

**Step 2: Update `repositories/index.ts`**

Replace `export { upsertSpeeches } from './speeches.ts'` with:

```typescript
export { upsertInterventions } from './interventions.ts';
```

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 4: Commit**

```bash
git add packages/database/src/repositories/
git commit -m "feat(database): add upsertInterventions repository, remove speeches"
```

---

### Task 4: Update the `intervention-detail` retriever schema

**Files:**

- Modify: `apps/ingestion/src/retrievers/intervention-detail.ts`

The retriever currently emits `SpeechInput`-shaped records. Update it to emit
`InterventionDetailRecord` — the HTML-scraped half, without bulk metadata
fields:

**Step 1: Update schema and emitted records**

```typescript
const Schema = z.object({
  order: z.number(),
  sessionDate: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  sessionUrl: z.string(),
  speaker: z.string(),
  speakerName: z.string(),
  speakerRole: z.string().optional(),
  text: z.string(),
});
```

This is unchanged from the current `SpeechInputSchema` shape — the retriever is
already correct. Just update the import reference if needed.

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/ingestion/src/retrievers/intervention-detail.ts
git commit -m "fix(ingestion): align intervention-detail retriever schema with InterventionInput"
```

---

### Task 5: Create the `intervention` processor (stream join)

**Files:**

- Create: `apps/ingestion/src/processors/intervention.ts`

The processor receives a mixed stream of:

- Bulk metadata records from `intervention` (type `InterventionMetadata`)
- HTML-scraped records from `intervention-detail` (type `InterventionDetail`)

It accumulates bulk metadata into a `Map<string, InterventionMetadata[]>` keyed
by `sessionUrl`, then enriches each HTML record when it arrives.

```typescript
import { EMPTY, mergeMap, of, scan } from 'rxjs';

import type { InterventionInput } from '@congress/database';
import type { Model as DetailModel } from '../retrievers/intervention-detail.ts';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';

type Input =
  | { source: 'intervention'; data: BulkModel }
  | { source: 'intervention-detail'; data: DetailModel };

// Key: sessionUrl (fragment-stripped) — matches ENLACETEXTOINTEGRO in bulk JSON
// Value: array of bulk metadata rows for that session
type MetadataMap = Map<string, BulkModel[]>;

const processor: Processor<Input, InterventionInput> = (source$) =>
  source$.pipe(
    scan(
      (acc: { map: MetadataMap; ready: InterventionInput[] }, tagged) => {
        if (tagged.source === 'intervention') {
          // Accumulate bulk metadata by session URL
          const url = tagged.data.ENLACETEXTOINTEGRO.split('#')[0];
          if (!url) return { ...acc, ready: [] };
          const existing = acc.map.get(url) ?? [];
          acc.map.set(url, [...existing, tagged.data]);
          return { map: acc.map, ready: [] };
        }

        // HTML detail record — match against accumulated bulk metadata
        const detail = tagged.data;
        const bulkRows = acc.map.get(detail.sessionUrl) ?? [];
        const match = bulkRows.find(
          (row) =>
            row.ORADOR.trim().toLowerCase() ===
            detail.speakerName.trim().toLowerCase(),
        );

        const enriched: InterventionInput = {
          endTime: match?.FININTERVENCION,
          initiativeSubject: match?.OBJETOINICIATIVA,
          interventionType: match?.TIPOINTERVENCION,
          order: detail.order,
          organ: match?.ORGANO,
          sessionDate: detail.sessionDate,
          sessionId: detail.sessionId,
          sessionTitle: detail.sessionTitle,
          sessionUrl: detail.sessionUrl,
          speaker: detail.speaker,
          speakerName: detail.speakerName,
          speakerRole: detail.speakerRole,
          startTime: match?.INICIOINTERVENCION,
          text: detail.text,
          videoDownloadUrl: match?.ENLACEDESCARGADIRECTA,
          videoUrl: match?.ENLACEDIFERIDO,
        };

        return { map: acc.map, ready: [enriched] };
      },
      { map: new Map(), ready: [] },
    ),
    mergeMap(({ ready }) => (ready.length > 0 ? of(...ready) : EMPTY)),
  );

export { processor };
```

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/ingestion/src/processors/intervention.ts
git commit -m "feat(ingestion): add intervention processor — merges bulk metadata with HTML text"
```

---

### Task 6: Update the sink and wire everything in `main.ts`

**Files:**

- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`
- Modify: `apps/ingestion/src/main.ts`

**Step 1: Replace `persistSpeeches` with `persistInterventions` in
`database.ts`**

```typescript
function persistInterventions(): Sink<unknown, PersistResult> {
  return createBatchedSink('interventions', async (batch) => {
    const result = await upsertInterventions(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}
```

Replace `upsertSpeeches` import with `upsertInterventions`. Remove
`persistSpeeches`.

**Step 2: Update `sinks/index.ts`**

Replace `persistSpeeches` with `persistInterventions`.

**Step 3: Update `main.ts`**

- Import `interventionProcessor` from `./processors/intervention.ts`
- Import `interventionRetriever` back from `./retrievers/intervention.ts`
- Import `interventionFinder` back from `./finders/intervention.ts`
- Add `intervention` back to `buildSources()`
- Add `intervention` back to `SCRAPER_TYPE_MAP` as `'interventions'`
- Replace the `intervention-detail` pipeline entry:

```typescript
{
  sources: ['intervention', 'intervention-detail'],
  processor: interventionProcessor as OperatorFunction<unknown, unknown>,
  sink: persistInterventions(),
},
```

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/ packages/database/src/
git commit -m "feat(ingestion): wire intervention pipeline — bulk metadata + HTML text merged before storage"
```

---

### Task 7: Update the queries layer

**Files:**

- Modify: `packages/database/src/queries/speeches.ts` → rename to
  `interventions.ts`
- Modify: `packages/database/src/queries/index.ts`

**Step 1: Rename and update the query file**

Rename `speeches.ts` to `interventions.ts`. Replace all `speech`/`Speech`
references with `intervention`/`Intervention`. The query structure (filters,
pagination, sort) stays the same — just rename the Prisma model calls.

**Step 2: Update `queries/index.ts`**

Replace `export * from './speeches.ts'` with
`export * from './interventions.ts'`.

**Step 3: Type-check both packages**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add packages/database/src/queries/
git commit -m "feat(database): rename speeches query layer to interventions"
```

---

### Notes

**Stream join timing:** The processor uses `scan` to accumulate bulk metadata.
For this to work, `intervention` source records must arrive **before** the
matching `intervention-detail` records. Since `intervention` fetches a single
JSON file (fast) while `intervention-detail` scrapes ~200+ HTML pages with
Playwright (slow), this ordering is naturally guaranteed in practice. No
explicit ordering is needed.

**Speaker name matching:** The bulk JSON `ORADOR` field and the HTML-parsed
`speakerName` may have minor formatting differences (accents, ordering). The
processor uses case-insensitive comparison. If a match is not found, the
intervention is still stored — just without metadata enrichment (video links,
timestamps, organ). This is intentional: `text` is available and complete;
metadata is best-effort.

**Pipeline dependency:** The `intervention` + `intervention-detail` sources both
need to be active for the pipeline to work correctly. Add an `interventions`
alias to `SOURCE_ALIASES` in `main.ts`:

```typescript
interventions: ['intervention', 'intervention-detail'],
```

# Side Inputs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Replace database lookups in processors with RxJS stream-based side
inputs, making processors pure transformations that synchronize via
`withLatestFrom`.

**Architecture:** Side inputs are `Observable<Map<K, V>>` built from
retriever/processor output streams using `reduce` + `shareReplay(1)`. Processors
become factory functions `(ctx: ProcessorContext) => OperatorFunction<T, U>`
that receive side inputs via context. Entity IDs are generated upstream
(retriever/processor) using `createId()` so side inputs can be built entirely
from streams without waiting for persistence.

**Tech Stack:** RxJS (`reduce`, `shareReplay`, `withLatestFrom`, `concat`),
`@paralleldrive/cuid2` for upstream ID generation, Prisma, TypeScript.

---

### Task 1: Add `@paralleldrive/cuid2` dependency

The ingestion package needs a CUID generator for upstream ID creation. Prisma
uses `cuid()` internally but doesn't expose it.

**Files:**

- Modify: `apps/ingestion/package.json`

**Step 1: Install the dependency**

```bash
pnpm --filter @congress/ingestion add @paralleldrive/cuid2
```

**Step 2: Verify it's in package.json**

```bash
grep cuid2 apps/ingestion/package.json
```

Expected: `"@paralleldrive/cuid2": "^2..."` in dependencies.

**Step 3: Commit**

```bash
git add apps/ingestion/package.json pnpm-lock.yaml
git commit -m "chore(ingestion): add @paralleldrive/cuid2 for upstream ID generation"
```

---

### Task 2: Add `buildSideInput` utility and `ProcessorContext` type

Create the core primitive for building side inputs from streams, and define the
context type that processors will receive.

**Files:**

- Create: `apps/ingestion/src/side-inputs.ts`
- Modify: `apps/ingestion/src/types.ts`

**Step 1: Create `side-inputs.ts`**

```typescript
import { EMPTY, concat, from, reduce, shareReplay } from 'rxjs';

import type { Observable } from 'rxjs';

/**
 * Builds a side input from a data stream.
 * Accumulates all records into a Map<K, V> and emits the complete map
 * exactly once when the source stream completes.
 * shareReplay(1) caches the result for late subscribers.
 */
function buildSideInput<T, K, V>(
  source$: Observable<T>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V,
): Observable<Map<K, V>> {
  return source$.pipe(
    reduce((map, item) => {
      map.set(keyFn(item), valueFn(item));
      return map;
    }, new Map<K, V>()),
    shareReplay(1),
  );
}

/**
 * Builds a side input pre-populated from a database seed, then augmented
 * by live stream data. Used in delta runs where existing data is already
 * in the database.
 *
 * For from-scratch runs, pass EMPTY as seed$.
 */
function buildSeededSideInput<T, K, V>(
  seed$: Observable<T>,
  live$: Observable<T>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V,
): Observable<Map<K, V>> {
  return buildSideInput(concat(seed$, live$), keyFn, valueFn);
}

export { buildSeededSideInput, buildSideInput };
```

**Step 2: Add `ProcessorContext` to `types.ts`**

Add the following to the end of `apps/ingestion/src/types.ts`, before the export
block:

```typescript
import type { Observable } from 'rxjs';

/**
 * Context holding side inputs available to processors.
 * Side inputs are Observable<Map> that emit exactly once when their
 * source stream completes, providing a complete lookup map.
 */
interface ProcessorContext {
  /** normalizeSpanishName(person.name) → person.id */
  personMap$: Observable<Map<string, string>>;
  /** normalizeSpanishName(person.name) → deputy.id (most recent for legislature) */
  deputyMap$: Observable<Map<string, string>>;
  /** "personId::normalizedRole" → governmentMember.id */
  governmentMemberMap$: Observable<Map<string, string>>;
}
```

Update the `Processor` type from plain operator to factory function:

```typescript
// Before:
type Processor<T, U = T> = OperatorFunction<T, U>;

// After:
type Processor<T, U = T> = (ctx: ProcessorContext) => OperatorFunction<T, U>;
```

Add `ProcessorContext` to the export block.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: errors in `main.ts` and all processors because the `Processor` type
changed. These will be fixed in subsequent tasks.

**Step 4: Commit**

```bash
git add apps/ingestion/src/side-inputs.ts apps/ingestion/src/types.ts
git commit -m "feat(ingestion): add buildSideInput utility and ProcessorContext type"
```

---

### Task 3: Generate IDs upstream in person retriever

The person retriever must emit `personId` and `deputyId` so side inputs can be
built from the stream. Use `createId()` from `@paralleldrive/cuid2`.

**Files:**

- Modify: `apps/ingestion/src/retrievers/person.ts`
- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add `personId` and `deputyId` to `PersonInputSchema`**

In `packages/database/src/validation/schemas.ts`, add optional ID fields to
`PersonInputSchema`:

```typescript
export const PersonInputSchema = z.object({
  biography: z.string().optional(),
  constituency: z.string(),
  deputyId: z.string().optional(), // ← NEW: pre-generated deputy ID
  electoralFormation: z.string(),
  endDate: z.string().optional(),
  fullConditionDate: z.string().optional(),
  groupEndDate: z.string().optional(),
  groupStartDate: z.string(),
  name: z.string(),
  parliamentaryGroup: z.string(),
  personId: z.string().optional(), // ← NEW: pre-generated person ID
  startDate: z.string(),
});
```

**Step 2: Generate IDs in person retriever**

In `apps/ingestion/src/retrievers/person.ts`, import `createId` and add ID
generation to the schema transform. The person retriever needs to track which
names have been seen to reuse the same `personId` for duplicate names (same
person, different deputy terms):

```typescript
import { createId } from '@paralleldrive/cuid2';

// Track personId by name to handle same-person multiple-term records
const personIds = new Map<string, string>();

// In the Schema.transform callback, add:
const personId = personIds.get(raw.NOMBRE) ?? createId();
personIds.set(raw.NOMBRE, personId);

// Return object:
return {
  biography: ...,
  constituency: ...,
  deputyId: createId(),   // unique per deputy term
  electoralFormation: ...,
  // ... existing fields ...
  name: raw.NOMBRE,
  personId,               // same for duplicate names
  startDate: ...,
};
```

**Step 3: Update `upsertDeputies` to use pre-generated IDs**

In `packages/database/src/repositories/deputies.ts`, update the `person.upsert`
and `deputy.upsert` calls to use the pre-generated IDs when provided:

```typescript
const person = await tx.person.upsert({
  where: { name: data.name },
  create: {
    id: data.personId ?? undefined, // ← use pre-generated ID if provided
    name: data.name,
    biography: data.biography,
  },
  update: { biography: data.biography },
});

// ...

await tx.deputy.upsert({
  where: {
    personId_legislature_startDate: {
      personId: person.id,
      legislature,
      startDate,
    },
  },
  create: {
    id: data.deputyId ?? undefined, // ← use pre-generated ID if provided
    personId: person.id,
    // ... rest of fields
  },
  update: {
    /* ... existing fields ... */
  },
});
```

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

Expected: clean (new optional fields are backward-compatible).

**Step 5: Commit**

```bash
git add apps/ingestion/src/retrievers/person.ts \
  packages/database/src/validation/schemas.ts \
  packages/database/src/repositories/deputies.ts
git commit -m "feat(ingestion,database): generate personId and deputyId upstream in person retriever"
```

---

### Task 4: Generate `governmentMemberId` upstream in government-members processor

The government-members processor must emit records with pre-generated IDs so
`governmentMemberMap$` can be built from its output stream.

**Files:**

- Modify: `apps/ingestion/src/processors/government-members.ts`
- Modify: `packages/database/src/validation/schemas.ts`
- Modify: `packages/database/src/repositories/governmentMembers.ts`

**Step 1: Add `id` and `personId` to `GovernmentMemberInputSchema`**

In `packages/database/src/validation/schemas.ts`:

```typescript
export const GovernmentMemberInputSchema = z.object({
  id: z.string().optional(), // ← NEW: pre-generated GM ID
  legislature: z.number().int().default(15),
  name: z.string().min(1),
  personId: z.string().optional(), // ← NEW: resolved person ID
  role: z.string().min(1),
});
```

**Step 2: Update government-members processor to generate IDs**

The processor needs access to `ctx.personMap$` to resolve `name → personId`, and
it needs to generate `governmentMemberId` for each record.

In `apps/ingestion/src/processors/government-members.ts`:

```typescript
import { createId } from '@paralleldrive/cuid2';
import { EMPTY, from, mergeMap, pipe, reduce, withLatestFrom } from 'rxjs';

import { NAME_OVERRIDES } from '../corrections/name-overrides.ts';
import { normalizeSpanishName } from '../utils.ts';

import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { GovernmentMemberInput } from '@congress/database';

const GOVERNMENT_ROLE_PATTERN =
  /ministro|ministra|vicepresidente del gobierno|vicepresidenta del gobierno|presidente del gobierno|secretario de estado|secretaria de estado/i;

const processor: Processor<BulkModel, GovernmentMemberInput> = (ctx) =>
  pipe(
    reduce((acc: Map<string, GovernmentMemberInput>, row) => {
      const role = row.CARGOORADOR ?? '';
      if (!role || !GOVERNMENT_ROLE_PATTERN.test(role)) return acc;

      const rawName = (row.ORADOR ?? '').replace(/\s*\([^)]+\)\s*$/, '').trim();
      if (!rawName) return acc;

      const canonicalName = NAME_OVERRIDES[rawName] ?? rawName;

      const key = `${canonicalName}::${role}`;
      if (!acc.has(key)) {
        acc.set(key, {
          id: createId(),
          name: canonicalName,
          role,
          legislature: 15,
        });
      }
      return acc;
    }, new Map<string, GovernmentMemberInput>()),
    mergeMap((map) => (map.size > 0 ? from([...map.values()]) : EMPTY)),
    // Resolve personId from person side input
    withLatestFrom(ctx.personMap$),
    mergeMap(([record, personMap]) => {
      const key = normalizeSpanishName(record.name);
      const personId = personMap.get(key);
      return from([{ ...record, personId }]);
    }),
  );

export { processor };
```

**Step 3: Update `upsertGovernmentMembers` to use pre-generated IDs**

In `packages/database/src/repositories/governmentMembers.ts`, when `personId` is
already provided in the input, skip the `findOrCreatePerson` call:

```typescript
async function upsertGovernmentMembers(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  for (const record of records) {
    const result = GovernmentMemberInputSchema.safeParse(record);
    if (!result.success) {
      skipped++;
      continue;
    }

    const data: GovernmentMemberInput = result.data;

    // Use pre-resolved personId if provided, otherwise fall back to DB lookup
    const personId = data.personId ?? (await findOrCreatePerson(data.name));

    await prisma.governmentMember.upsert({
      where: {
        personId_role_legislature: {
          personId,
          role: data.role,
          legislature: data.legislature,
        },
      },
      create: {
        id: data.id ?? undefined,
        personId,
        role: data.role,
        legislature: data.legislature,
      },
      update: {},
    });
    success++;
  }

  return { success, skipped };
}
```

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/processors/government-members.ts \
  packages/database/src/validation/schemas.ts \
  packages/database/src/repositories/governmentMembers.ts
git commit -m "feat(ingestion,database): generate governmentMemberId upstream, resolve personId via side input"
```

---

### Task 5: Build side inputs in orchestrator

Wire the side inputs in `main.ts`: build `personMap$`, `deputyMap$`, and
`governmentMemberMap$` from source streams, create the `ProcessorContext`, and
pass it to processors.

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Import side input utilities**

Add to imports at top of `main.ts`:

```typescript
import { buildSideInput } from './side-inputs.ts';
import { normalizeSpanishName } from './utils.ts';
import type { ProcessorContext } from './types.ts';
```

**Step 2: Build `personMap$` and `deputyMap$` from the person source stream**

After the `sourceData$` map is built (after the
`for (const entry of activeSources)` loop, ~line 444), add:

```typescript
// Build side inputs from source streams.
// Person source emits records with pre-generated personId and deputyId.
const personSource$ = sourceData$.get('person');
const personMap$ = personSource$
  ? buildSideInput(
      personSource$.pipe(
        map(({ data }) => data as { name: string; personId: string }),
      ),
      (p) => normalizeSpanishName(p.name),
      (p) => p.personId,
    )
  : buildSideInput(
      EMPTY as Observable<never>,
      () => '',
      () => '',
    );

const deputyMap$ = personSource$
  ? buildSideInput(
      personSource$.pipe(
        map(({ data }) => data as { name: string; deputyId: string }),
      ),
      (p) => normalizeSpanishName(p.name),
      (p) => p.deputyId,
    )
  : buildSideInput(
      EMPTY as Observable<never>,
      () => '',
      () => '',
    );
```

**Step 3: Build `governmentMemberMap$` from the government-members pipeline
output**

The government-members processor output needs to be tapped before it reaches the
sink. This requires a small restructuring: the government-members pipeline must
capture its processor output as a shared stream that feeds both the sink and the
side input.

To avoid changing the pipeline wiring significantly, use a `Subject` that the
government-members sink `tap`s into:

```typescript
import { ReplaySubject } from 'rxjs';

// Government member records flow through this subject to build the side input.
// ReplaySubject ensures late subscribers see all records.
const govMemberRecords$ = new ReplaySubject<{
  id: string;
  personId?: string;
  role: string;
}>();

const governmentMemberMap$ = buildSideInput(
  govMemberRecords$.asObservable(),
  (gm) => `${gm.personId ?? ''}::${gm.role.trim().toLowerCase()}`,
  (gm) => gm.id,
);
```

Then modify the government-members pipeline to `tap` into this subject. In the
`PIPELINES` array, the government-members entry needs a `tap` before the sink.
The simplest way: add a `tap` operator in the pipeline wiring section (step 3 of
the orchestrator):

```typescript
// In the pipeline streams loop, for the government-members pipeline:
const processed$ = entry.processor
  ? filtered$.pipe(entry.processor)
  : filtered$;

// If this is the government-members pipeline, tap records into the subject
// This is identified by checking if sources === ['intervention'] and
// processor === governmentMembersProcessor — but a cleaner approach is
// to add an optional `onRecord` callback to PipelineEntry.
```

**Simpler approach**: add a `tag` field to `PipelineEntry` and use it to
identify the government-members pipeline:

```typescript
interface PipelineEntry<T, U> {
  sources: string[];
  processor?: OperatorFunction<T, U>;
  sink: Sink<U, unknown>;
  tag?: string;  // optional identifier for pipeline-specific side effects
}

// In PIPELINES:
{
  sources: ['intervention'],
  processor: governmentMembersProcessor(ctx) as OperatorFunction<unknown, unknown>,
  sink: persistGovernmentMembers(),
  tag: 'government-members',
},
```

In the pipeline wiring loop:

```typescript
let processed$ = entry.processor ? filtered$.pipe(entry.processor) : filtered$;

// Tap government-members output into side input subject
if (entry.tag === 'government-members') {
  processed$ = processed$.pipe(
    tap((record) => {
      const gm = record as { id: string; personId?: string; role: string };
      govMemberRecords$.next(gm);
    }),
    tap({ complete: () => govMemberRecords$.complete() }),
  );
}
```

**Step 4: Create `ProcessorContext` and pass to processors**

```typescript
const ctx: ProcessorContext = {
  personMap$,
  deputyMap$,
  governmentMemberMap$,
};
```

Update the pipeline wiring to call processor factories with `ctx`:

```typescript
// Before:
const processed$ = entry.processor
  ? filtered$.pipe(entry.processor)
  : filtered$;

// After (processors are now factories):
const processed$ = entry.processor
  ? filtered$.pipe(entry.processor)
  : filtered$;
```

Wait — `entry.processor` is already the result of calling the factory. The
change happens where `PIPELINES` is defined:

```typescript
const PIPELINES: PipelineEntry<unknown, unknown>[] = [
  { sources: ['person'], sink: persistDeputies() },
  { sources: ['person-detail'], sink: persistPersonDetail() },
  {
    sources: ['person'],
    processor: partyProcessor(ctx) as OperatorFunction<unknown, unknown>,
    sink: persistParties(),
  },
  { sources: ['voting'], sink: persistVotes() },
  {
    sources: ['bureau'],
    processor: bureauProcessor(ctx) as OperatorFunction<unknown, unknown>,
    sink: persistOrganMembers(),
  },
  {
    sources: ['intervention', 'intervention-detail'],
    processor: interventionProcessor(ctx) as OperatorFunction<unknown, unknown>,
    sink: persistInterventions(),
  },
  {
    sources: ['intervention'],
    processor: governmentMembersProcessor(ctx) as OperatorFunction<
      unknown,
      unknown
    >,
    sink: persistGovernmentMembers(),
    tag: 'government-members',
  },
  { sources: ['initiatives'], sink: persistInitiatives() },
  {
    sources: ['interest-declarations'],
    processor: interestDeclarationsProcessor(ctx) as OperatorFunction<
      unknown,
      unknown
    >,
    sink: persistInterestDeclarations(),
  },
  {
    sources: ['interest-declarations-detail'],
    processor: interestDeclarationsDetailProcessor as OperatorFunction<
      unknown,
      unknown
    >,
    sink: persistInterestDeclarations(),
  },
];
```

**Important**: `PIPELINES` must move from a module-level constant into the
`runAll` function body — it now depends on `ctx` which depends on `sourceData$`
which is built at runtime. Move the entire `PIPELINES` array inside `runAll`,
after `ctx` is created.

**Step 5: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: errors in processors that haven't been updated to the factory
signature yet. These are fixed in the next tasks.

**Step 6: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit -m "feat(ingestion): build side inputs in orchestrator, pass ProcessorContext to processors"
```

---

### Task 6: Migrate intervention processor to use side inputs

Remove all `prisma` imports and DB queries. Use `withLatestFrom` to synchronize
with `personMap$` and `governmentMemberMap$`.

**Files:**

- Modify: `apps/ingestion/src/processors/intervention.ts`

**Step 1: Replace the processor**

The processor changes from:

- Phase 1 (scan): unchanged
- Phase 2 (`mergeMap(async ...)`): replaces lazy `prisma.person.findMany` and
  per-record `prisma.governmentMember.findMany` with `withLatestFrom`

```typescript
import { EMPTY, from, map, mergeMap, scan, withLatestFrom } from 'rxjs';

import { NAME_OVERRIDES } from '../corrections/name-overrides.ts';
import { normalizeSpanishName } from '../utils.ts';

import type { Model as DetailModel } from '../retrievers/intervention-detail.ts';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';
import type { InterventionInput } from '@congress/database';

type MetadataMap = Map<string, BulkModel[]>;

interface AccState {
  map: MetadataMap;
  ready: InterventionInput[];
  used: Set<string>;
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
    // Phase 1: scan accumulation (unchanged — pure, no side inputs needed)
    scan(
      (acc: AccState, record: unknown): AccState => {
        if (isBulkModel(record)) {
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

          const normalizedHtmlSpeaker = normalizeSpanishName(
            record.speakerName,
          );
          const htmlFirstWord = normalizedHtmlSpeaker.split(' ')[0] ?? '';

          let matchIdx = -1;

          if (htmlFirstWord.length >= 3) {
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

          if (matchIdx === -1) {
            matchIdx = bulkRows.findIndex(
              (_, idx) => !acc.used.has(`${record.sessionUrl}:${String(idx)}`),
            );
          }

          const match = matchIdx >= 0 ? bulkRows[matchIdx] : undefined;

          if (matchIdx >= 0) {
            acc.used.add(`${record.sessionUrl}:${String(matchIdx)}`);
          }

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

        return { map: acc.map, used: acc.used, ready: [] };
      },
      { map: new Map(), ready: [], used: new Set<string>() },
    ),
    mergeMap(({ ready }) => (ready.length > 0 ? from(ready) : EMPTY)),
    // Phase 2: enrich via side inputs (replaces all DB queries)
    withLatestFrom(ctx.personMap$, ctx.governmentMemberMap$),
    map(([enriched, personMap, govMap]) => {
      // Check static overrides first for known transcription errors
      const overrideName = NAME_OVERRIDES[enriched.speakerName];
      const key = overrideName
        ? normalizeSpanishName(overrideName)
        : normalizeSpanishName(enriched.speakerName);
      let personId: string | undefined = personMap.get(key);

      // Fallback: try speakerRole as a name if personId is still unresolved
      if (!personId && enriched.speakerRole) {
        const overrideFromRole = NAME_OVERRIDES[enriched.speakerRole];
        const roleKey = overrideFromRole
          ? normalizeSpanishName(overrideFromRole)
          : normalizeSpanishName(enriched.speakerRole);
        personId = personMap.get(roleKey);
      }

      // Resolve governmentMemberId via side input
      let governmentMemberId: string | undefined;
      if (enriched.speakerRole?.trim() && personId) {
        const normalizedRole = enriched.speakerRole.trim().toLowerCase();
        const govKey = `${personId}::${normalizedRole}`;
        governmentMemberId = govMap.get(govKey);
      }

      return { ...enriched, personId, governmentMemberId };
    }),
  );

export { processor };
```

**Step 2: Verify no `prisma` import remains**

```bash
grep -n "prisma" apps/ingestion/src/processors/intervention.ts
```

Expected: no matches.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/intervention.ts
git commit -m "feat(ingestion): migrate intervention processor to side inputs — remove all DB queries"
```

---

### Task 7: Migrate bureau processor to use side inputs

Replace `prisma.person.findUnique` per record with `withLatestFrom(personMap$)`.

**Files:**

- Modify: `apps/ingestion/src/processors/bureau.ts`

**Step 1: Replace the processor**

```typescript
import { map, withLatestFrom } from 'rxjs';

import { normalizeSpanishName } from '../utils.ts';

import type { Model } from '../retrievers/bureau.ts';
import type { Processor } from '../types.ts';
import type { BureauInput } from '@congress/database';

const processor: Processor<Model, BureauInput> = (ctx) => (source$) =>
  source$.pipe(
    withLatestFrom(ctx.personMap$),
    map(([record, personMap]) => {
      const personId = personMap.get(normalizeSpanishName(record.name));
      return {
        endDate: record.endDate,
        group: record.group,
        name: record.name,
        organName: record.organName,
        personId,
        position: record.position,
        startDate: record.startDate,
      } satisfies BureauInput;
    }),
  );

export { processor };
```

**Step 2: Verify no `prisma` import remains**

```bash
grep -n "prisma" apps/ingestion/src/processors/bureau.ts
```

Expected: no matches.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/bureau.ts
git commit -m "feat(ingestion): migrate bureau processor to side inputs"
```

---

### Task 8: Migrate interest-declarations processor to use side inputs

Replace `prisma.person.findFirst` per deputy name with
`withLatestFrom(deputyMap$)`.

**Files:**

- Modify: `apps/ingestion/src/processors/interest-declarations.ts`

**Step 1: Replace the processor**

```typescript
import { EMPTY, from, mergeMap, pipe, reduce, withLatestFrom } from 'rxjs';

import { normalizeSpanishName } from '../utils.ts';

import type { Model } from '../retrievers/interest-declarations.ts';
import type { Processor } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

const processor: Processor<Model, InterestDeclarationInput> = (ctx) =>
  pipe(
    reduce((acc: Map<string, Model[]>, row) => {
      const existing = acc.get(row.NOMBRE) ?? [];
      acc.set(row.NOMBRE, [...existing, row]);
      return acc;
    }, new Map<string, Model[]>()),
    // Wait for deputy side input, then resolve all names at once
    withLatestFrom(ctx.deputyMap$),
    mergeMap(([map, deputyMap]) => {
      const results: InterestDeclarationInput[] = [];

      for (const [name, rows] of map.entries()) {
        const firstRow = rows[0];
        if (!firstRow) continue;

        const yearStr = firstRow.FECHAREGISTRO.split('/')[2];
        const year = yearStr ? parseInt(yearStr, 10) : NaN;
        if (isNaN(year)) continue;

        // Normalize name: docacteco uses "Surname,Name" (no space after comma)
        const normalizedName = name.replace(/,(\S)/g, ', $1');
        const deputyId = deputyMap.get(normalizeSpanishName(normalizedName));

        if (!deputyId) {
          console.warn(
            `[interestDeclarations] No deputy found for name: ${name}`,
          );
          continue;
        }

        const professionalActivities = rows
          .filter((r) => r.TIPO === 'ACTIVIDAD')
          .map((r) => ({
            entity: r.EMPLEADOR ?? '',
            position: r.DESCRIPCION ?? '',
            remunerated: r.SECTOR === 'PÚBLICO' || r.SECTOR === 'PRIVADO',
            startDate: r.PERIODO,
          }));

        const donations = rows
          .filter((r) => r.TIPO === 'DONACION')
          .map((r) => ({
            ...(r.BENEFACTOR != null && { benefactor: r.BENEFACTOR }),
            description: r.DESCRIPCION ?? '',
          }));

        const foundations = rows
          .filter((r) => r.TIPO === 'FUNDACIONES')
          .map((r) => ({
            ...(r.DESCRIPCION != null && { description: r.DESCRIPCION }),
            recipient: r.DESTINATARIO ?? '',
          }));

        const observations = rows
          .filter((r) => r.TIPO === 'OBSERVACIONES')
          .map((r) => ({
            text: r.OBSERVACIONES ?? '',
          }));

        results.push({
          deputyId,
          donations: donations.length > 0 ? donations : undefined,
          foundations: foundations.length > 0 ? foundations : undefined,
          observations: observations.length > 0 ? observations : undefined,
          professionalActivities:
            professionalActivities.length > 0
              ? professionalActivities
              : undefined,
          year,
        });
      }

      return results.length > 0 ? from(results) : EMPTY;
    }),
  );

export { processor };
```

**Step 2: Verify no `prisma` import remains**

```bash
grep -n "prisma" apps/ingestion/src/processors/interest-declarations.ts
```

Expected: no matches.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/interest-declarations.ts
git commit -m "feat(ingestion): migrate interest-declarations processor to side inputs"
```

---

### Task 9: Update party processor to factory signature

The party processor doesn't use side inputs, but its type must match the new
`Processor` factory signature.

**Files:**

- Modify: `apps/ingestion/src/processors/party.ts`

**Step 1: Wrap in factory function**

```typescript
import { mergeMap, of, pipe, reduce } from 'rxjs';

import { PARTY_NAMES, PARTY_PARENTS } from '../config/party-parents.ts';

import type { PartyInput } from '@congress/database';
import type { Processor } from '../types.ts';

interface PersonModel {
  electoralFormation: string;
}

const processor: Processor<PersonModel, PartyInput> = (_ctx) =>
  pipe(
    reduce((acc, record: PersonModel) => {
      const shortName = record.electoralFormation.trim();
      if (!shortName) return acc;

      acc.set(shortName, {
        shortName,
        name: PARTY_NAMES[shortName],
        parentShortName: PARTY_PARENTS[shortName],
      });

      return acc;
    }, new Map<string, Partial<PartyInput> & { shortName: string }>()),
    mergeMap((map) =>
      of(
        ...[...map.values()].filter((e): e is PartyInput => {
          if (!e.name) {
            console.warn(
              `[party] No name in PARTY_NAMES for: ${e.shortName} — add it to config/party-parents.ts`,
            );
            return false;
          }
          return true;
        }),
      ),
    ),
  );

export { processor };
```

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/ingestion/src/processors/party.ts
git commit -m "refactor(ingestion): update party processor to factory signature"
```

---

### Task 10: Update interest-declarations-detail processor to factory signature

Check if this processor uses DB queries or just needs the type signature update.

**Files:**

- Modify: `apps/ingestion/src/processors/interest-declarations-detail.ts`

**Step 1: Read the processor**

Read `apps/ingestion/src/processors/interest-declarations-detail.ts` to check if
it does DB lookups.

**Step 2: Wrap in factory function if needed**

If it's a plain `OperatorFunction`, wrap it in `(_ctx) => pipe(...)`. If it does
DB lookups, migrate them to side inputs following the same pattern.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/interest-declarations-detail.ts
git commit -m "refactor(ingestion): update interest-declarations-detail processor to factory signature"
```

---

### Task 11: Full type-check and lint

Verify the entire codebase compiles and passes lint.

**Files:**

- All modified files

**Step 1: Type-check both packages**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

Expected: clean.

**Step 2: Lint**

```bash
pnpm --filter @congress/ingestion lint
pnpm --filter @congress/database lint
```

Expected: clean (zero warnings).

**Step 3: Fix any issues found**

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(ingestion): resolve type-check and lint issues after side inputs migration"
```

---

### Task 12: Run from-scratch ingestion and verify

Delete the database and run a full ingestion to verify side inputs work
correctly on an empty database.

**Step 1: Delete existing database**

```bash
rm -f packages/database/prisma/dev.db
pnpm --filter @congress/database exec prisma migrate dev --name fresh
```

**Step 2: Run person source first**

```bash
pnpm --filter @congress/ingestion scrape --source=person
```

Expected: deputies and parties persisted. Person side input built from stream.

**Step 3: Run interventions**

```bash
pnpm --filter @congress/ingestion scrape --source=interventions
```

Expected: government members extracted. Interventions enriched with `personId`
and `governmentMemberId` from side inputs (no DB lookups in processors).

**Step 4: Check attribution statistics**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT
  COUNT(*) as total,
  COUNT(personId) as linked_person,
  COUNT(governmentMemberId) as linked_gov,
  ROUND(100.0 * COUNT(personId) / COUNT(*), 1) as person_pct
FROM Intervention
WHERE procedural = 0;
"
```

Expected: similar or better attribution rates compared to pre-migration.

**Step 5: Run remaining sources**

```bash
pnpm --filter @congress/ingestion scrape --source=bureau
pnpm --filter @congress/ingestion scrape --source=declarations
```

**Step 6: Verify all processors produced results**

Check the ingestion summary output for each source.

**Step 7: Commit results**

```bash
git commit --allow-empty -m "feat: side inputs migration complete — verified from-scratch run"
```

---

### Notes

**`withLatestFrom` and stream completion:** `withLatestFrom` will NOT emit if
the side input observable never emits. If the person source is not active (e.g.
`--source=bureau` without `--source=person`), the `personMap$` side input will
be built from `EMPTY` which completes immediately with an empty map. This means
bureau records will get `personId: undefined` — same as current behavior when
persons aren't in the DB.

**Government member ordering:** The `governmentMemberMap$` side input is built
from the government-members pipeline output, which reads from the `intervention`
source. The intervention processor's Phase 2 (`withLatestFrom(govMap$)`) blocks
until `govMap$` emits. Since both pipelines share the same `intervention`
source, the government-members `reduce` must complete before `govMap$` emits.
The `reduce` completes when the `intervention` source stream completes. At that
point, `intervention-detail` is still running (gated by
`after: ['intervention']`), so the intervention processor's Phase 1 (scan) is
still accumulating detail records. By the time Phase 2 runs (after scan emits
ready records), `govMap$` is guaranteed to have emitted. This ordering is
naturally correct.

**`personIds` map in person retriever (Task 3):** The `personIds` Map used to
deduplicate person IDs by name is module-level state that persists across the
retriever's lifetime. This is safe because the person retriever processes one
URL (the bulk JSON), and `oboe` parses it sequentially. No concurrency issues.

**Backward compatibility:** All schema changes (`personId`, `deputyId`, `id`
fields) are optional. If a record arrives without pre-generated IDs, the
repository falls back to Prisma's `@default(cuid())`. This means old tests,
manual scripts, and delta runs that don't go through the new retriever still
work.

**`interestDeclarationsDetailProcessor`:** This processor may or may not need DB
lookups — Task 10 requires reading it first. If it does a lookup (e.g. resolving
`codParlamentario → deputyId`), migrate it to use `deputyMap$` or a
`codParlamentarioMap$` side input. If it's pure, just wrap in factory.

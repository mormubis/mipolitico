# Missing Processors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Implement three missing processors: (1) interest-declarations bulk
JSON → structured activities/donations, (2) entity resolution for
`OrganMember.personId` and `Intervention.personId` moved out of repositories
into processors, and (3) `Deputy.partyId` population after parties are
persisted.

**Architecture:** Each processor is an RxJS `OperatorFunction` that receives raw
retriever output, performs async enrichment (DB lookups), and emits complete
records ready for the sink. Repositories become pure write operations with no DB
lookups. The `Deputy.partyId` processor runs as a post-party pipeline step that
matches `Deputy.electoralFormation` against `Party.shortName`.

**Tech Stack:** Prisma (SQLite), Zod, RxJS (`mergeMap`, `pipe`, `EMPTY`, `of`),
TypeScript.

---

### Task 1: interest-declarations processor — map bulk rows to structured activities

**Context:** The `interest-declarations` retriever emits one row per
activity/donation/foundation from the `docacteco` bulk JSON. Each row has:
`NOMBRE` (deputy name), `TIPO` (ACTIVIDAD|DONACION|FUNDACIONES|OBSERVACIONES),
`DECLARACION` (declaration type), `FECHAREGISTRO` (DD/MM/YYYY), `EMPLEADOR`,
`SECTOR`, `DESCRIPCION`, `PERIODO`, `BENEFACTOR`, `DESTINATARIO`,
`OBSERVACIONES`.

The `InterestDeclarationInput` schema needs `deputyId` (CUID), `year` (int), and
optionally `professionalActivities`. The processor must:

1. Group rows by `NOMBRE` (all rows for the same deputy form one declaration)
2. Extract `year` from `FECHAREGISTRO` (first 4 chars of the year portion)
3. Map `TIPO=ACTIVIDAD` rows to `professionalActivities` (entity=`EMPLEADOR`,
   position=`DESCRIPCION`, remunerated=`SECTOR==='PÚBLICO'||'PRIVADO'` → true)
4. Resolve `NOMBRE → Deputy.id` via `Person.name`
5. Skip `TIPO=DONACION`, `TIPO=FUNDACIONES`, `TIPO=OBSERVACIONES` for now — the
   schema has no matching arrays (they come from `docbienes`, not `docacteco`)

**Files:**

- Modify: `apps/ingestion/src/processors/interest-declarations.ts`
- Modify: `apps/ingestion/src/main.ts` (wire the processor to the
  `interest-declarations` pipeline)

**Step 1: Replace the identity processor**

```typescript
import { prisma } from '@congress/database';
import { EMPTY, from, mergeMap, pipe, reduce } from 'rxjs';

import type { InterestDeclarationInput } from '@congress/database';
import type { Model } from '../retrievers/interest-declarations.ts';
import type { Processor } from '../types.ts';

// Group bulk rows by deputy name, then resolve to InterestDeclarationInput
const processor: Processor<Model, InterestDeclarationInput> = pipe(
  // Accumulate all rows into a map: name → rows[]
  reduce((acc: Map<string, Model[]>, row) => {
    const existing = acc.get(row.NOMBRE) ?? [];
    acc.set(row.NOMBRE, [...existing, row]);
    return acc;
  }, new Map<string, Model[]>()),
  // For each deputy group, resolve to InterestDeclarationInput
  mergeMap((map) =>
    from(
      Promise.all(
        [...map.entries()].map(async ([name, rows]) => {
          // Extract year from FECHAREGISTRO (DD/MM/YYYY → YYYY)
          const firstRow = rows[0];
          if (!firstRow) return null;
          const yearStr = firstRow.FECHAREGISTRO.split('/')[2];
          const year = yearStr ? parseInt(yearStr, 10) : NaN;
          if (isNaN(year)) return null;

          // Resolve name → Deputy.id
          const person = await prisma.person.findFirst({
            where: { name: { contains: name } },
            select: {
              deputies: {
                select: { id: true },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
            },
          });

          const deputyId = person?.deputies[0]?.id;
          if (!deputyId) {
            console.warn(
              `[interestDeclarations] No deputy found for name: ${name}`,
            );
            return null;
          }

          // Map ACTIVIDAD rows to professionalActivities
          const professionalActivities = rows
            .filter((r) => r.TIPO === 'ACTIVIDAD')
            .map((r) => ({
              entity: r.EMPLEADOR ?? '',
              position: r.DESCRIPCION ?? '',
              remunerated: r.SECTOR === 'PÚBLICO' || r.SECTOR === 'PRIVADO',
              startDate: r.PERIODO ?? undefined,
              endDate: undefined,
            }));

          return {
            deputyId,
            year,
            professionalActivities:
              professionalActivities.length > 0
                ? professionalActivities
                : undefined,
          } satisfies InterestDeclarationInput;
        }),
      ),
    ),
  ),
  mergeMap((results) =>
    from(results.filter((r): r is InterestDeclarationInput => r !== null)),
  ),
);

export { processor };
```

**Step 2: Wire the interest-declarations pipeline in `main.ts`**

The `interest-declarations` source currently has no pipeline entry. Add one:

```typescript
{
  sources: ['interest-declarations'],
  processor: interestDeclarationsProcessor as OperatorFunction<unknown, unknown>,
  sink: persistInterestDeclarations(),
},
```

Import `interestDeclarationsProcessor` from
`./processors/interest-declarations.ts`.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: clean.

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/interest-declarations.ts apps/ingestion/src/main.ts
git commit -m "feat(ingestion): implement interest-declarations processor — maps bulk rows to structured activities"
```

---

### Task 2: Move `OrganMember.personId` resolution out of repository into processor

**Context:** `packages/database/src/repositories/organMembers.ts` currently does
`tx.person.findUnique({ where: { name: data.name } })` inside the upsert loop —
this violates the "enrichment before storage" principle. The repository should
receive a complete record with `personId` already resolved.

**Files:**

- Create: `apps/ingestion/src/processors/bureau.ts`
- Modify: `packages/database/src/repositories/organMembers.ts`
- Modify: `packages/database/src/validation/schemas.ts`
- Modify: `apps/ingestion/src/main.ts`

**Step 1: Add `personId` to `BureauInputSchema`**

In `packages/database/src/validation/schemas.ts`, add `personId` as optional:

```typescript
export const BureauInputSchema = z.object({
  endDate: z.string(),
  group: z.string(),
  name: z.string(),
  organName: z.string(),
  personId: z.string().optional(), // resolved by processor
  position: z.string(),
  startDate: z.string(),
});
```

**Step 2: Create `apps/ingestion/src/processors/bureau.ts`**

```typescript
import { prisma } from '@congress/database';
import { EMPTY, mergeMap, of } from 'rxjs';

import type { BureauInput } from '@congress/database';
import type { Model } from '../retrievers/bureau.ts';
import type { Processor } from '../types.ts';

const processor: Processor<Model, BureauInput> = (source$) =>
  source$.pipe(
    mergeMap(async (record) => {
      const person = await prisma.person.findUnique({
        where: { name: record.name },
        select: { id: true },
      });

      return {
        endDate: record.endDate,
        group: record.group,
        name: record.name,
        organName: record.organName,
        personId: person?.id,
        position: record.position,
        startDate: record.startDate,
      } satisfies BureauInput;
    }),
    mergeMap((record) => (record ? of(record) : EMPTY)),
  );

export { processor };
```

**Step 3: Remove person resolution from `organMembers.ts` repository**

In `packages/database/src/repositories/organMembers.ts`, remove the
`tx.person.findUnique` call and use `data.personId ?? null` directly:

```typescript
// Remove these lines:
const person = await tx.person.findUnique({
  where: { name: data.name },
});

// Replace:
personId: person?.id ?? null,
// With:
personId: data.personId ?? null,
```

**Step 4: Wire in `main.ts`**

Import `bureauProcessor` from `./processors/bureau.ts` and update the bureau
pipeline:

```typescript
{
  sources: ['bureau'],
  processor: bureauProcessor as OperatorFunction<unknown, unknown>,
  sink: persistOrganMembers(),
},
```

**Step 5: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 6: Commit**

```bash
git add apps/ingestion/src/processors/bureau.ts apps/ingestion/src/main.ts \
  packages/database/src/repositories/organMembers.ts \
  packages/database/src/validation/schemas.ts
git commit -m "fix(ingestion,database): move OrganMember.personId resolution into bureau processor"
```

---

### Task 3: Move `Intervention.personId` resolution out of repository into processor

**Context:** Same issue as Task 2 but for `interventions.ts` repository. The
`tx.person.findFirst` call inside `upsertInterventions` violates "enrichment
before storage".

**Files:**

- Modify: `packages/database/src/repositories/interventions.ts`
- Modify: `packages/database/src/validation/schemas.ts`
- Modify: `apps/ingestion/src/processors/intervention.ts`

**Step 1: Add `personId` to `InterventionInputSchema`**

In `packages/database/src/validation/schemas.ts`, add `personId` as optional:

```typescript
export const InterventionInputSchema = z.object({
  endTime: z.string().optional(),
  initiativeSubject: z.string().optional(),
  interventionType: z.string().optional(),
  order: z.number(),
  organ: z.string().optional(),
  personId: z.string().optional(), // resolved by processor
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
```

**Step 2: Remove person resolution from `interventions.ts` repository**

Remove the `tx.person.findFirst` call and use `data.personId ?? null` directly:

```typescript
// Remove:
const person = await tx.person.findFirst({
  where: { name: { contains: data.speakerName } },
});

// Replace:
personId: person?.id ?? null,
// With:
personId: data.personId ?? null,
```

**Step 3: Enrich `InterventionInput` with `personId` in `intervention.ts`
processor**

In `apps/ingestion/src/processors/intervention.ts`, after building the
`enriched` object in the detail record branch, add a DB lookup for `personId`:

The processor currently uses `scan` which is synchronous. To make async lookups,
change the detail branch to return a promise by wrapping the enrichment step.
Replace the `scan` approach for detail records with an async `mergeMap` step
after scan:

```typescript
// After the existing scan + mergeMap(from(ready)):
mergeMap(async (enriched) => {
  const person = await prisma.person.findFirst({
    where: {
      name: { contains: enriched.speakerName },
    },
    select: { id: true },
  });
  return { ...enriched, personId: person?.id };
}),
```

Add `import { prisma } from '@congress/database';` to the processor.

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/processors/intervention.ts \
  packages/database/src/repositories/interventions.ts \
  packages/database/src/validation/schemas.ts
git commit -m "fix(ingestion,database): move Intervention.personId resolution into intervention processor"
```

---

### Task 4: Populate `Deputy.partyId` after parties are persisted

**Context:** `Deputy.partyId` is always `null`. The `partyProcessor` runs as a
pipeline using both `person` and `person-detail` sources, emitting `PartyInput`
records to `persistParties`. After parties are stored, we need to link deputies
to their party using `Deputy.electoralFormation === Party.shortName`.

This is a post-party enrichment step. The cleanest approach: add a
`linkDeputiesToParties` function to the deputies repository that runs as a
separate pipeline step after `persistParties` completes.

Since RxJS pipelines run concurrently, we can't guarantee parties exist before
deputies try to link. The solution: make `linkDeputiesToParties` run as a
standalone step triggered via `SCRAPER_TYPE_MAP` or as a post-processing hook.

The simplest correct approach: add `persistDeputyPartyLinks` as a separate
pipeline that reads from the `person` source (which emits deputy data with
`electoralFormation`), and after the party pipeline has completed, resolves the
links. However since pipelines run concurrently, timing is not guaranteed.

**Better approach:** Add `linkDeputiesToParties` as a repository function that
runs at the end of `upsertParties` — after parties are upserted, immediately
update all deputies in the same transaction whose `electoralFormation` matches a
`Party.shortName`.

**Files:**

- Modify: `packages/database/src/repositories/parties.ts`

**Step 1: Read `parties.ts` to understand current structure**

Read `packages/database/src/repositories/parties.ts`.

**Step 2: Add party→deputy linking inside `upsertParties`**

After all parties are upserted, add a loop that links deputies:

```typescript
// After all party upserts complete, link deputies to their party
const parties = await tx.party.findMany({
  select: { id: true, shortName: true },
});

for (const party of parties) {
  await tx.deputy.updateMany({
    where: {
      electoralFormation: party.shortName,
      partyId: null,
    },
    data: { partyId: party.id },
  });
}
```

This runs inside the existing `$transaction`, so it's atomic with the party
upserts.

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 4: Commit**

```bash
git add packages/database/src/repositories/parties.ts
git commit -m "feat(database): populate Deputy.partyId after parties are upserted"
```

---

### Notes

**Task 1 — `PERIODO` field:** The `PERIODO` field in `ACTIVIDAD` rows contains a
year string (e.g. `"2018"`) not a date range. Map it to `startDate` as-is.
`endDate` will be `undefined`.

**Task 1 — `year` from `FECHAREGISTRO`:** `FECHAREGISTRO` is `"DD/MM/YYYY"`.
Split on `/` and take the last element. Parse as integer.

**Task 3 — async in scan:** The `scan` operator in `intervention.ts` is
synchronous. Adding an async step after the `mergeMap(from(ready))` is clean —
it operates on fully-enriched `InterventionInput` records emitted one at a time.

**Task 4 — timing:** Since `upsertParties` only runs when the `partyProcessor`
emits (after both `person` and `person-detail` complete), and `upsertDeputies`
runs earlier (from `person` alone), deputies will always exist by the time
`upsertParties` runs. The linking step inside `upsertParties` is safe.

**Task 4 — `parentShortName` resolution:** `PartyInput` has `parentShortName`
which is currently stored but `Party.parentId` is never populated. This plan
does NOT include resolving `parentId` — that's a separate concern.

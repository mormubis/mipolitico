# Party Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Populate the `Party` model by merging `person` and `person-detail`
retriever streams through a single party processor that extracts formation data,
deduplicates, and persists to the database with parent-child relationships.

**Architecture:** A new `runPartyPipeline()` merges the outputs of the existing
`personRetriever` and `personDetailRetriever` into a single stream. A
`partyProcessor` transforms the union type into `PartyInput` records,
deduplicating by `shortName` and applying a static parent map. A new
`persistParties()` sink calls `upsertParties()` which does a two-pass upsert to
resolve `parentId` links.

**Tech Stack:** TypeScript strict ESM, Prisma (SQLite / better-sqlite3), RxJS
(`merge`, `share`, `reduce`, `mergeMap`), Zod, pnpm workspaces, Vitest (if unit
tests exist) or manual integration test script.

---

### Task 1: Schema — add `parentId` self-relation to `Party` and make `name` nullable

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Read the current `Party` model**

Open `packages/database/prisma/schema.prisma` and find the `Party` model. It
currently has:

```prisma
model Party {
  id        String   @id @default(cuid())
  name      String   @unique
  shortName String?
  ...
}
```

**Step 2: Update the `Party` model**

Replace the `Party` model fields with:

```prisma
model Party {
  id        String   @id @default(cuid())
  /// Full official name of the party (e.g. "Partido Popular"). Nullable until enriched by person-detail scraper.
  name      String?
  /// Abbreviated party name or acronym from opendata (e.g. "PP"). Used as the natural key.
  shortName String   @unique
  /// Optional reference to canonical parent party for regional branches (e.g. PSC-PSOE → PSOE).
  parentId  String?
  /// Timestamp of record creation.
  createdAt DateTime @default(now())
  /// Timestamp of last record update.
  updatedAt DateTime @updatedAt

  /// Self-relation for canonical parent party.
  parent   Party?  @relation("PartyAffiliation", fields: [parentId], references: [id])
  children Party[] @relation("PartyAffiliation")

  /// Linked entities.
  deputies     Deputy[]
  speeches     Speech[]
  organMembers OrganMember[]

  @@unique([shortName])
}
```

Note: `name` is now `String?` (nullable). `shortName` is now `String @unique`
(required, was optional). Remove the old `@@unique([name])` if present.

**Step 3: Generate and apply migration**

```bash
pnpm --filter @congress/database exec prisma migrate dev --name add-party-parent-relation
```

Expected: migration created and applied, no errors.

**Step 4: Verify Prisma client regenerated**

```bash
pnpm --filter @congress/database exec prisma generate
```

Expected: client generated with updated `Party` type.

**Step 5: Commit**

```bash
git add packages/database/prisma/ && git commit -m "feat(database): add parentId self-relation to Party, make name nullable"
```

---

### Task 2: Validation schema — add `PartyInputSchema`

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add the schema at the bottom of `schemas.ts`**

```ts
// Input schema for party scraper output
export const PartyInputSchema = z.object({
  name: z.string().optional(),
  shortName: z.string(),
  parentShortName: z.string().optional(),
});
export type PartyInput = z.infer<typeof PartyInputSchema>;
```

**Step 2: Verify it exports correctly**

Check `packages/database/src/validation/index.ts` — if it re-exports from
`schemas.ts` via `export * from './schemas.ts'`, no further change needed.
Otherwise add the export.

**Step 3: Commit**

```bash
git add packages/database/src/validation/schemas.ts && git commit -m "feat(database): add PartyInputSchema"
```

---

### Task 3: Repository — `packages/database/src/repositories/parties.ts`

**Files:**

- Create: `packages/database/src/repositories/parties.ts`
- Modify: `packages/database/src/repositories/index.ts`

**Step 1: Create the repository**

```ts
import { prisma } from '../client.ts';
import { PartyInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { PartyInput } from '../validation/index.ts';

export async function upsertParties(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: PartyInput[] = [];
  for (const record of records) {
    const result = PartyInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('parties', record, result.error);
      skipped++;
    }
  }

  // First pass: upsert all parties without parentId
  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      await tx.party.upsert({
        where: { shortName: data.shortName },
        create: { shortName: data.shortName, name: data.name ?? null },
        update: { name: data.name ?? undefined },
      });
      success++;
    }
  });

  // Second pass: resolve parentId links
  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      if (!data.parentShortName) continue;
      const parent = await tx.party.findUnique({
        where: { shortName: data.parentShortName },
      });
      if (!parent) continue;
      await tx.party.update({
        where: { shortName: data.shortName },
        data: { parentId: parent.id },
      });
    }
  });

  return { success, skipped };
}
```

**Step 2: Export from repositories index**

Add to `packages/database/src/repositories/index.ts`:

```ts
export { upsertParties } from './parties.ts';
```

**Step 3: Commit**

```bash
git add packages/database/src/repositories/parties.ts packages/database/src/repositories/index.ts && git commit -m "feat(database): add upsertParties repository"
```

---

### Task 4: Config — static party parent map

**Files:**

- Create: `apps/ingestion/src/config/party-parents.ts`

**Step 1: Create the config file**

```ts
/**
 * Static map of regional electoral formation shortNames to their canonical
 * parent party shortName. Maintained manually — update when new parties
 * enter parliament after an election.
 *
 * Source: DiputadosActivos opendata, XV legislature (2023–present).
 */
export const PARTY_PARENTS: Record<string, string> = {
  'PSC-PSOE': 'PSOE',
  'PSE-EE (PSOE)': 'PSOE',
  'PsdeG-PSOE': 'PSOE',
  'PSIB-PSOE': 'PSOE',
  'PSN-PSOE': 'PSOE',
};
```

**Step 2: Commit**

```bash
git add apps/ingestion/src/config/party-parents.ts && git commit -m "feat(ingestion): add static party parent map config"
```

---

### Task 5: Processor — `apps/ingestion/src/processors/party.ts`

**Files:**

- Create: `apps/ingestion/src/processors/party.ts`

The processor accepts a union of `PersonModel` (from `person` retriever) and
`PersonDetailModel` (from `person-detail` retriever). Both have
`FORMACIONELECTORAL`. Only `PersonDetailModel` has `FORMACION` (full name).

**Step 1: Check the exact model types**

Open `apps/ingestion/src/retrievers/person.ts` and
`apps/ingestion/src/retrievers/person-detail.ts` to confirm the exported or
inferred model types and field names. The key fields are:

- `person` retriever model: `FORMACIONELECTORAL: string`
- `person-detail` retriever model: `FORMACIONELECTORAL: string`,
  `FORMACION: string`

**Step 2: Create the processor**

```ts
import { EMPTY, reduce } from 'rxjs';

import { PARTY_PARENTS } from '../config/party-parents.ts';

import type { OperatorFunction } from 'rxjs';
import type { PartyInput } from '@congress/database';

type PersonModel = { FORMACIONELECTORAL: string };
type PersonDetailModel = { FORMACIONELECTORAL: string; FORMACION: string };
type Input = PersonModel | PersonDetailModel;

function hasFormacion(input: Input): input is PersonDetailModel {
  return 'FORMACION' in input && typeof input.FORMACION === 'string';
}

export const processor: OperatorFunction<Input, PartyInput> = (source$) =>
  source$.pipe(
    reduce((acc, record) => {
      const shortName = record.FORMACIONELECTORAL.trim();
      if (!shortName) return acc;

      const existing = acc.get(shortName) ?? {
        shortName,
        name: undefined,
        parentShortName: PARTY_PARENTS[shortName],
      };

      // Enrich with full name if available
      if (hasFormacion(record) && record.FORMACION.trim()) {
        existing.name = record.FORMACION.trim();
      }

      acc.set(shortName, existing);
      return acc;
    }, new Map<string, PartyInput>()),
    (obs) =>
      new (require('rxjs').Observable)<PartyInput>((subscriber) => {
        obs.subscribe({
          next: (map) => {
            for (const entry of map.values()) {
              subscriber.next(entry);
            }
          },
          complete: () => subscriber.complete(),
          error: (err) => subscriber.error(err),
        });
      }),
  );
```

> **Note:** Avoid `require()` — use a proper Observable construction. Here is
> the corrected implementation without `require`:

```ts
import { Observable, reduce } from 'rxjs';

import { PARTY_PARENTS } from '../config/party-parents.ts';

import type { OperatorFunction } from 'rxjs';
import type { PartyInput } from '@congress/database';

type PersonModel = { FORMACIONELECTORAL: string };
type PersonDetailModel = { FORMACIONELECTORAL: string; FORMACION: string };
type Input = PersonModel | PersonDetailModel;

function hasFormacion(input: Input): input is PersonDetailModel {
  return (
    'FORMACION' in input &&
    typeof (input as PersonDetailModel).FORMACION === 'string'
  );
}

export const processor: OperatorFunction<Input, PartyInput> = (source$) =>
  new Observable<PartyInput>((subscriber) => {
    source$
      .pipe(
        reduce((acc, record) => {
          const shortName = record.FORMACIONELECTORAL.trim();
          if (!shortName) return acc;

          const existing = acc.get(shortName) ?? {
            shortName,
            name: undefined as string | undefined,
            parentShortName: PARTY_PARENTS[shortName],
          };

          if (hasFormacion(record) && record.FORMACION.trim()) {
            existing.name = record.FORMACION.trim();
          }

          acc.set(shortName, existing);
          return acc;
        }, new Map<string, PartyInput>()),
      )
      .subscribe({
        next: (map) => {
          for (const entry of map.values()) {
            subscriber.next(entry);
          }
          subscriber.complete();
        },
        error: (err: unknown) => subscriber.error(err),
      });
  });
```

**Step 3: Check for lint errors**

```bash
pnpm --filter @congress/ingestion exec eslint src/processors/party.ts --max-warnings 0
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/party.ts && git commit -m "feat(ingestion): add party processor"
```

---

### Task 6: Sink — add `persistParties()` to `sinks/database.ts`

**Files:**

- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`

**Step 1: Add import at top of `sinks/database.ts`**

Add `upsertParties` to the existing import from `@congress/database`.

**Step 2: Add `persistParties()` function**

Follow the exact same pattern as `persistDeputies()`:

```ts
/**
 * RxJS operator that buffers party records and persists to database.
 */
export function persistParties(): OperatorFunction<unknown, PersistResult> {
  let batches = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertParties(batch);
        batches++;
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        console.log(
          `[parties] Batch ${String(batches)}: ${String(result.success)} success, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[parties] Complete: ${String(batches)} batches, ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'parties',
                batches,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}
```

**Step 3: Export from `sinks/index.ts`**

Check `apps/ingestion/src/sinks/index.ts`. Add:

```ts
export { persistParties } from './database.ts';
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/sinks/ && git commit -m "feat(ingestion): add persistParties sink operator"
```

---

### Task 7: Pipeline — add `runPartyPipeline()` to `main.ts`

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Add missing imports**

At the top of `main.ts`, add:

```ts
import { finder as personDetailFinder } from './finders/person-detail.ts';
import { retriever as personDetailRetriever } from './retrievers/person-detail.ts';
import { processor as partyProcessor } from './processors/party.ts';
import { persistParties } from './sinks/index.ts';
```

**Step 2: Add `runPartyPipeline()`**

Add after `runPersonPipeline()`:

```ts
async function runPartyPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    const options: CommonOptions = { browser, fetch };

    const personUrls$ = personFinder(options).pipe(share());
    const detailUrls$ = personDetailFinder(options).pipe(share());

    const person$ = personUrls$.pipe(
      mergeMap((url: string) =>
        personRetriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );
    const detail$ = detailUrls$.pipe(
      mergeMap((url: string) =>
        personDetailRetriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );

    await lastValueFrom(
      merge(person$, detail$).pipe(partyProcessor, persistParties()),
    );

    await updateScraperMetadata('parties', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('parties', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
```

**Step 3: Register in the `pipelines` map**

```ts
const pipelines: Record<string, () => Promise<void>> = {
  bureau: runBureauPipeline,
  initiatives: runInitiativesPipeline,
  interestDeclarations: runInterestDeclarationsPipeline,
  intervention: runInterventionPipeline,
  parties: runPartyPipeline, // ← add this
  person: runPersonPipeline,
  voting: runVotingPipeline,
};
```

**Step 4: Export from the bottom of `main.ts`**

```ts
export {
  runBureauPipeline,
  runInitiativesPipeline,
  runInterestDeclarationsPipeline,
  runInterventionPipeline,
  runPartyPipeline, // ← add this
  runPersonPipeline,
  runVotingPipeline,
};
```

**Step 5: Check for type errors**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors.

**Step 6: Check for lint errors**

```bash
pnpm --filter @congress/ingestion exec eslint src/main.ts --max-warnings 0
```

Expected: 0 warnings.

**Step 7: Commit**

```bash
git add apps/ingestion/src/main.ts && git commit -m "feat(ingestion): add runPartyPipeline to main"
```

---

### Task 8: Verification — full type check and lint across all packages

**Step 1: Type check all packages**

```bash
pnpm --filter @congress/database exec tsc --noEmit
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors in both.

**Step 2: Lint all packages**

```bash
pnpm --filter @congress/database exec eslint src/ --max-warnings 0
pnpm --filter @congress/ingestion exec eslint src/ --max-warnings 0
```

Expected: 0 warnings in both.

**Step 3: Commit if any formatting fixes were auto-applied**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: fix lint/format after party scraper implementation"
```

---

### Task 9: Update `docs/data-model.md`

**Files:**

- Modify: `docs/data-model.md`

**Step 1: Update the Party gap entry**

Find the gap entry:

> `Party` model unpopulated | Medium | Remove or build scraper

Replace with:

> `Party` model | — | Populated via party scraper; `parentId` self-relation
> models regional branches

**Step 2: Update the diagram at the top** to show `Party` with a self-relation
arrow.

**Step 3: Commit**

```bash
git add docs/data-model.md && git commit -m "docs: mark Party gap resolved, update data model"
```

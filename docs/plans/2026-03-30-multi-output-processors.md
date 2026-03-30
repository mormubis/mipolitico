# Multi-Output Processors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** All processors emit `TaggedOutput` records. The orchestrator routes
each tag to its corresponding sink. Eliminates redundant processing and enables
co-emitting derived entities.

**Architecture:** Introduce `TaggedOutput<T> = { tag: string, data: T }` and
`emit(tag, data)` helper. Change `PipelineEntry` from `sink: Sink` to
`sinks: Record<string, Sink>`. Orchestrator uses `share()` + `filter(tag)` +
`map(data)` to route. Merge intervention + government-members into one
processor. Merge deputy pass-through + party into one processor.

**Tech Stack:** RxJS (`share`, `filter`, `map`, `concat`, `defer`, `tap`),
TypeScript, `@paralleldrive/cuid2`.

---

### Task 1: Add `TaggedOutput` type and `emit` helper

**Files:**

- Modify: `apps/ingestion/src/types.ts`

**Step 1: Add types and helper**

Add before the `Processor` type:

```typescript
/**
 * Tagged output record. Processors emit tagged records so the orchestrator
 * can route each tag to its corresponding sink.
 */
interface TaggedOutput<T = unknown> {
  tag: string;
  data: T;
}

/** Helper to create tagged output records inside processors. */
function emit<T>(tag: string, data: T): TaggedOutput<T> {
  return { tag, data };
}
```

Wait — `emit` is a runtime function, not a type. It should live in a separate
file or alongside `side-inputs.ts`. Put it in `types.ts` since it's small and
closely coupled to `TaggedOutput`. Export both.

Update the `Processor` type to emit `TaggedOutput`:

```typescript
type Processor<T> = (
  ctx: ProcessorContext,
) => OperatorFunction<T, TaggedOutput>;
```

Note: `Processor` loses its second generic parameter `U` — all processors now
emit `TaggedOutput`. The `tag` string discriminates the output type.

Update exports to include `TaggedOutput` and `emit`.

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: errors in all processors (return type changed). Fixed in later tasks.

**Step 3: Commit**

```bash
git add apps/ingestion/src/types.ts
git commit -m "feat(ingestion): add TaggedOutput type and emit helper"
```

---

### Task 2: Update `PipelineEntry` and orchestrator routing

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Change `PipelineEntry`**

Replace:

```typescript
interface PipelineEntry<T, U> {
  sources: string[];
  processor?: OperatorFunction<T, U>;
  sink: Sink<U, unknown>;
  tag?: string;
}
```

With:

```typescript
interface PipelineEntry {
  sources: string[];
  processor?: OperatorFunction<unknown, TaggedOutput>;
  sinks: Record<string, Sink<unknown, unknown>>;
}
```

Import `TaggedOutput` from `./types.ts`.

**Step 2: Update pipeline wiring**

Replace the current pipeline stream building (the `activePipelines.map` block)
with multi-output routing:

```typescript
const pipelineStreams = activePipelines.flatMap((entry) => {
  const filtered$ = data$.pipe(
    filter(({ source }) => entry.sources.includes(source)),
    map(({ data }) => data),
  );

  const processed$ = entry.processor
    ? filtered$.pipe(entry.processor)
    : filtered$.pipe(
        map((data) => ({ tag: Object.keys(entry.sinks)[0]!, data })),
      );

  const shared$ = processed$.pipe(share());
  const label = `[${entry.sources.join('+')}]`;

  return Object.entries(entry.sinks).map(([sinkTag, sink]) => {
    const tagLabel = `${label} → ${sinkTag}`;
    return shared$.pipe(
      filter((output: TaggedOutput) => output.tag === sinkTag),
      map((output: TaggedOutput) => output.data),
      sink as Sink<unknown, unknown>,
      tap((result) => {
        results.push({
          label: tagLabel,
          status: 'success',
          result: result as PersistResult,
        });
      }),
      catchError((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[main] Pipeline ${tagLabel} failed: ${message}`);
        results.push({ label: tagLabel, status: 'error', error: message });
        return EMPTY;
      }),
    );
  });
});
```

**Step 3: Update government member side input wiring**

Remove the `tag` field check. Instead, identify the government member sink
stream by checking if the pipeline sources include `'intervention'` and `sinks`
has a `'governmentMember'` key. Or simpler: tap into the `governmentMember`
tagged records from the shared stream before routing:

In the `Object.entries(entry.sinks).map(...)` loop, when
`sinkTag === 'governmentMember'`, add the tap for `govMemberRecords$`.

**Step 4: Update PIPELINES registry**

Convert all pipeline entries from `sink` to `sinks`. For now, keep the same
pipeline structure (one sink per pipeline). Multi-output pipelines come in later
tasks.

```typescript
const PIPELINES: PipelineEntry[] = [
  { sources: ['deputy'], sinks: { deputy: persistDeputies() } },
  {
    sources: ['deputy-detail'],
    sinks: { deputyDetail: persistPersonDetail() },
  },
  {
    sources: ['deputy'],
    processor: partyProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
    sinks: { party: persistParties() },
  },
  { sources: ['voting'], sinks: { vote: persistVotes() } },
  {
    sources: ['bureau'],
    processor: bureauProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
    sinks: { organMember: persistOrganMembers() },
  },
  {
    sources: ['intervention', 'intervention-detail'],
    processor: interventionProcessor(ctx) as OperatorFunction<
      unknown,
      TaggedOutput
    >,
    sinks: { intervention: persistInterventions() },
  },
  {
    sources: ['intervention'],
    processor: governmentMembersProcessor(ctx) as OperatorFunction<
      unknown,
      TaggedOutput
    >,
    sinks: { governmentMember: persistGovernmentMembers() },
  },
  { sources: ['initiative'], sinks: { initiative: persistInitiatives() } },
  {
    sources: ['declaration'],
    processor: declarationProcessor(ctx) as OperatorFunction<
      unknown,
      TaggedOutput
    >,
    sinks: { declaration: persistInterestDeclarations() },
  },
  {
    sources: ['declaration-detail'],
    processor: declarationDetailProcessor(ctx) as OperatorFunction<
      unknown,
      TaggedOutput
    >,
    sinks: { declaration: persistInterestDeclarations() },
  },
];
```

**Step 5: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: errors in processors (return type mismatch). Fixed in next tasks.

**Step 6: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit -m "feat(ingestion): update PipelineEntry to sinks map with TaggedOutput routing"
```

---

### Task 3: Wrap all single-output processors with `emit()`

**Files:**

- Modify: `apps/ingestion/src/processors/bureau.ts`
- Modify: `apps/ingestion/src/processors/declaration.ts`
- Modify: `apps/ingestion/src/processors/declaration-detail.ts`
- Modify: `apps/ingestion/src/processors/party.ts`
- Modify: `apps/ingestion/src/processors/government-members.ts`
- Modify: `apps/ingestion/src/processors/intervention.ts`

For each processor, import `emit` from `../types.ts` and wrap the final output.

**Bureau**: Change
`map(([record, personMap]) => ({ ... } satisfies BureauInput))` to
`map(([record, personMap]) => emit('organMember', { ... } satisfies BureauInput))`.

**Declaration**: Wrap `results.push(...)` items and the final `from(results)`
emission in `emit('declaration', result)`.

**Declaration-detail**: Wrap `of({ ... } satisfies InterestDeclarationInput)` in
`of(emit('declaration', { ... } satisfies InterestDeclarationInput))`.

**Party**: Wrap each party record in `emit('party', record)`.

**Government-members**: Wrap each emitted record in
`emit('governmentMember', record)`.

**Intervention**: Wrap the final `map(...)` return in
`emit('intervention', { ...enriched, personId, governmentMemberId })`.

Update the `Processor` type usage in each file — the type is now
`Processor<InputType>` (single generic, no output type).

**Step 1: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

Expected: clean.

**Step 2: Lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: clean.

**Step 3: Commit**

```bash
git add apps/ingestion/src/processors/
git commit -m "feat(ingestion): wrap all processors with emit() for TaggedOutput"
```

---

### Task 4: Merge intervention + government-members into one processor

**Files:**

- Modify: `apps/ingestion/src/processors/intervention.ts`
- Delete: `apps/ingestion/src/processors/government-members.ts`
- Modify: `apps/ingestion/src/main.ts`

**Step 1: Absorb government-members logic into intervention processor**

Add to `AccState`:

```typescript
interface AccState {
  map: MetadataMap;
  ready: InterventionInput[];
  used: Set<string>;
  governmentMembers: Map<string, GovernmentMemberInput>; // NEW
  discoveredPersons: Map<string, string>; // NEW: name → personId
}
```

Import `createId` from `@paralleldrive/cuid2`, `GovernmentMemberInput` from
`@congress/database`, and the `GOVERNMENT_ROLE_PATTERN` (copy from
government-members.ts since we're deleting it).

During bulk record accumulation (`isBulkModel` branch), if `row.CARGOORADOR`
matches `GOVERNMENT_ROLE_PATTERN`, add to `acc.governmentMembers` map (same
dedup logic as current government-members processor).

In the enrichment phase (`withLatestFrom`), after resolving `personId`:

1. If `personId` is undefined and the speaker name looks like a real name
   (contains a comma — indicating "Surname, Name" format), check
   `discoveredPersons` map. If not there, generate a new ID with `createId()`,
   store in `discoveredPersons`, and emit `emit('person', { name, id })`.
2. If the speaker has a `speakerRole` and a government member match exists, emit
   `emit('governmentMember', gmRecord)`.
3. Always emit `emit('intervention', interventionRecord)`.

The enrichment phase changes from `map(...)` (single output) to `mergeMap(...)`
(multiple outputs per record):

```typescript
mergeMap(([enriched, personMap, govMap]) => {
  const outputs: TaggedOutput[] = [];

  // Resolve personId (existing logic)
  // ...

  // Discover new persons
  if (!personId && enriched.speakerName.includes(',')) {
    const key = normalizeSpanishName(enriched.speakerName);
    personId = acc.discoveredPersons.get(key);
    if (!personId) {
      personId = createId();
      // Note: discoveredPersons is on AccState, not accessible here directly.
      // Solution: use a module-level map (acceptable since processor runs once per pipeline)
    }
    outputs.push(emit('person', { name: enriched.speakerName, personId }));
  }

  outputs.push(emit('intervention', { ...enriched, personId, governmentMemberId }));

  return from(outputs);
}),
```

**Important subtlety**: The `discoveredPersons` map needs to persist across the
`withLatestFrom` boundary. Since `withLatestFrom` emits synchronously after the
side input arrives, a module-level `Map` works (same pattern as the old
`personLookup`).

**Step 2: Remove standalone government-members pipeline from PIPELINES**

In `main.ts`, remove the pipeline entry:

```typescript
{
  sources: ['intervention'],
  processor: governmentMembersProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
  sinks: { governmentMember: persistGovernmentMembers() },
},
```

Update the intervention pipeline entry to include all three sinks:

```typescript
{
  sources: ['intervention', 'intervention-detail'],
  processor: interventionProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
  sinks: {
    intervention: persistInterventions(),
    governmentMember: persistGovernmentMembers(),
    person: persistDeputies(),
  },
},
```

**Step 3: Update government member side input wiring**

The `govMemberRecords$` tap moves into the sink routing for the
`governmentMember` tag of the intervention pipeline. In the orchestrator's
`Object.entries(entry.sinks).map(...)` loop, add:

```typescript
if (sinkTag === 'governmentMember') {
  // Tap records into side input subject before persisting
  return shared$.pipe(
    filter((output: TaggedOutput) => output.tag === 'governmentMember'),
    tap((output) => {
      const gm = output.data as { id: string; personId?: string; role: string };
      govMemberRecords$.next(gm);
    }),
    tap({ complete: () => govMemberRecords$.complete() }),
    map((output: TaggedOutput) => output.data),
    sink as Sink<unknown, unknown>,
    // ... rest of tap/catchError for results
  );
}
```

**Step 4: Delete `processors/government-members.ts`**

```bash
git rm apps/ingestion/src/processors/government-members.ts
```

Remove its import from `main.ts`.

**Step 5: Type-check and lint**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm --filter @congress/ingestion lint:ci
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(ingestion): merge government-members into intervention processor — multi-output"
```

---

### Task 5: Merge deputy pass-through + party into deputy processor

**Files:**

- Create: `apps/ingestion/src/processors/deputy.ts`
- Delete: `apps/ingestion/src/processors/party.ts`
- Modify: `apps/ingestion/src/main.ts`

**Step 1: Create deputy processor**

```typescript
import { concat, defer, from, map, tap } from 'rxjs';

import { PARTY_NAMES, PARTY_PARENTS } from '../config/party-parents.ts';

import { emit } from '../types.ts';

import type { Processor } from '../types.ts';
import type { PartyInput } from '@congress/database';

interface DeputyModel {
  electoralFormation: string;
  [key: string]: unknown;
}

const processor: Processor<DeputyModel> = (_ctx) => (source$) => {
  const parties = new Map<
    string,
    Partial<PartyInput> & { shortName: string }
  >();

  return concat(
    source$.pipe(
      tap((record) => {
        const shortName = record.electoralFormation.trim();
        if (shortName && !parties.has(shortName)) {
          parties.set(shortName, {
            shortName,
            name: PARTY_NAMES[shortName],
            parentShortName: PARTY_PARENTS[shortName],
          });
        }
      }),
      map((record) => emit('deputy', record)),
    ),
    defer(() =>
      from(
        [...parties.values()]
          .filter((e): e is PartyInput => {
            if (!e.name) {
              console.warn(
                `[party] No name in PARTY_NAMES for: ${e.shortName} — add it to config/party-parents.ts`,
              );
              return false;
            }
            return true;
          })
          .map((p) => emit('party', p)),
      ),
    ),
  );
};

export { processor };
```

**Step 2: Update PIPELINES in main.ts**

Remove the standalone deputy pass-through and party pipelines:

```typescript
// Remove:
{ sources: ['deputy'], sinks: { deputy: persistDeputies() } },
{
  sources: ['deputy'],
  processor: partyProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
  sinks: { party: persistParties() },
},

// Replace with:
{
  sources: ['deputy'],
  processor: deputyProcessor(ctx) as OperatorFunction<unknown, TaggedOutput>,
  sinks: {
    deputy: persistDeputies(),
    party: persistParties(),
  },
},
```

Import `deputyProcessor` from `./processors/deputy.ts`. Remove `partyProcessor`
import.

**Step 3: Delete `processors/party.ts`**

```bash
git rm apps/ingestion/src/processors/party.ts
```

**Step 4: Type-check and lint**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm --filter @congress/ingestion lint:ci
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingestion): merge deputy + party into single multi-output deputy processor"
```

---

### Task 6: Full type-check, lint, and run smoke test

**Step 1: Full verification**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
pnpm --filter @congress/ingestion lint:ci
```

**Step 2: Run person source as smoke test**

```bash
pnpm --filter @congress/ingestion scrape --source=deputy
```

Expected: deputies and parties stored (same as before — the deputy processor now
emits both).

**Step 3: Run interventions source**

```bash
pnpm --filter @congress/ingestion scrape --source=interventions
```

Expected: interventions, government members, and potentially new person records
stored from the single intervention processor.

**Step 4: Check attribution stats**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT
  COUNT(*) as total,
  COUNT(personId) as linked,
  COUNT(governmentMemberId) as gov,
  ROUND(100.0 * COUNT(personId) / COUNT(*), 1) as pct
FROM Intervention WHERE procedural = 0;
"
```

Expected: similar or better attribution than 82.8%.

**Step 5: Commit**

```bash
git commit --allow-empty -m "feat: multi-output processors verified — from-scratch run"
```

---

### Notes

**`emit` function location:** The `emit` function is a runtime function exported
from `types.ts`. This is a slight break from the convention that `types.ts` only
has types, but the function is tiny (2 lines) and tightly coupled to
`TaggedOutput`. If this bothers you, move it to a separate `tagged-output.ts`
file.

**`discoveredPersons` in intervention processor:** The map must persist across
the `withLatestFrom` boundary. Use a module-level `Map` cleared at processor
creation (inside the factory function). This is safe because the processor
factory runs once per pipeline invocation.

**Government member emit timing:** Government member records are emitted during
the scan phase (when bulk records arrive), not during the enrichment phase. This
means `governmentMemberMap$` completes when the intervention source stream
completes — before the enrichment phase runs — which is exactly what we need for
`withLatestFrom(ctx.governmentMemberMap$)` to unblock.

**Backward compatibility:** The `sinks` map with a single entry behaves
identically to the old `sink` field. No behavioral change for single-output
pipelines.

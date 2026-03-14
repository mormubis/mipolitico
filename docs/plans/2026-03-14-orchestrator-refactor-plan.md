# Orchestrator Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Replace the vertical per-pipeline model in `main.ts` with a horizontal
registry-based orchestrator that shares a single tagged URL pool and data pool
across all finders and retrievers.

**Architecture:** The orchestrator tags each finder's output with a `source`
name, merges all tagged URLs into a shared pool, routes tagged URLs to the
matching retriever, tags retriever output, and merges all tagged data into a
shared pool. `PipelineEntry` definitions declare which sources they consume
from, allowing processors to combine data from multiple retrievers naturally.
Debug mode filters the registry by source name.

**Tech Stack:** TypeScript strict ESM, RxJS (`merge`, `share`, `filter`, `map`,
`mergeMap`, `retry`, `lastValueFrom`), pnpm workspaces. See
`docs/plans/2026-03-14-orchestrator-refactor-design.md` for full context.

---

### Task 1: Add `TaggedUrl` and `TaggedData` types to `types.ts`

**Files:**

- Modify: `apps/ingestion/src/types.ts`

**Step 1: Read the current file**

Read `apps/ingestion/src/types.ts`. It currently has `CommonOptions`, `Finder`,
`RetrieverOptions`, `Retriever`, `Processor`.

**Step 2: Add the two new types**

Add after the existing types, before the export:

```ts
interface TaggedUrl {
  source: string;
  url: string;
}

interface TaggedData<T = unknown> {
  source: string;
  data: T;
}
```

Export them:

```ts
export type {
  CommonOptions,
  Finder,
  Processor,
  Retriever,
  RetrieverOptions,
  TaggedData,
  TaggedUrl,
};
```

**Step 3: Type check**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/types.ts && git commit -m "feat(ingestion): add TaggedUrl and TaggedData types"
```

---

### Task 2: Rewrite `main.ts` with registry-based orchestrator

**Files:**

- Modify: `apps/ingestion/src/main.ts`

This is the core task. Read the current `main.ts` in full before starting.

**Step 1: Read current `main.ts`**

Read `apps/ingestion/src/main.ts`. Note:

- All imports at the top
- `runPipeline()` helper
- `buildVotingFilter()` watermark helper
- All `runXxxPipeline()` functions
- `pipelines` map and `main()` entry point
- Exports at the bottom

**Step 2: Write the new `main.ts`**

Replace the entire file with:

```ts
import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import {
  filter,
  lastValueFrom,
  map,
  merge,
  mergeMap,
  retry,
  share,
} from 'rxjs';

import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { finder as interestDeclarationsFinder } from './finders/interest-declarations.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personDetailFinder } from './finders/person-detail.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as interestDeclarationsProcessor } from './processors/interest-declarations.ts';
import { processor as partyProcessor } from './processors/party.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interest-declarations.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personDetailRetriever } from './retrievers/person-detail.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistParties,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';

import type {
  CommonOptions,
  Finder,
  Retriever,
  TaggedData,
  TaggedUrl,
} from './types.ts';
import type { OperatorFunction } from 'rxjs';

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

interface SourceEntry<T> {
  name: string;
  finder: Finder;
  retriever: Retriever<T>;
  urlFilter?: (url: string) => boolean;
}

interface PipelineEntry<T, U> {
  sources: string[];
  processor?: OperatorFunction<T, U>;
  sink: OperatorFunction<U, unknown>;
}

// ---------------------------------------------------------------------------
// Watermark helpers
// ---------------------------------------------------------------------------

async function buildVotingFilter(): Promise<(url: string) => boolean> {
  const existingKeys = await getExistingSessionKeys();
  return (url: string) => {
    const match = /Leg(\d+)\/Sesion(\d+)/.exec(url);
    if (!match) return true;
    const leg = match[1];
    const sess = match[2];
    if (!leg || !sess) return true;
    const key = `${leg}-${parseInt(sess, 10).toString()}`;
    return !existingKeys.has(key);
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function runAll(source?: string): Promise<void> {
  const votingFilter = await buildVotingFilter();

  const SOURCES: SourceEntry<unknown>[] = [
    { name: 'person', finder: personFinder, retriever: personRetriever },
    {
      name: 'person-detail',
      finder: personDetailFinder,
      retriever: personDetailRetriever,
    },
    {
      name: 'voting',
      finder: votingFinder,
      retriever: votingRetriever,
      urlFilter: votingFilter,
    },
    { name: 'bureau', finder: bureauFinder, retriever: bureauRetriever },
    {
      name: 'intervention',
      finder: interventionFinder,
      retriever: interventionRetriever,
    },
    {
      name: 'initiatives',
      finder: initiativesFinder,
      retriever: initiativesRetriever,
    },
    {
      name: 'interest-declarations',
      finder: interestDeclarationsFinder,
      retriever: interestDeclarationsRetriever,
    },
  ];

  const PIPELINES: PipelineEntry<unknown, unknown>[] = [
    { sources: ['person'], sink: persistDeputies() },
    {
      sources: ['person', 'person-detail'],
      processor: partyProcessor as OperatorFunction<unknown, unknown>,
      sink: persistParties(),
    },
    { sources: ['voting'], sink: persistVotes() },
    { sources: ['bureau'], sink: persistOrganMembers() },
    { sources: ['intervention'], sink: persistSpeeches() },
    { sources: ['initiatives'], sink: persistInitiatives() },
    {
      sources: ['interest-declarations'],
      processor: interestDeclarationsProcessor as OperatorFunction<
        unknown,
        unknown
      >,
      sink: persistInterestDeclarations(),
    },
  ];

  // Filter registry when --source is provided
  const activeSources = source
    ? SOURCES.filter((s) => s.name === source)
    : SOURCES;

  const activePipelines = source
    ? PIPELINES.filter((p) => p.sources.includes(source))
    : PIPELINES;

  const activeSourceNames = new Set(activeSources.map((s) => s.name));

  if (activeSources.length === 0) {
    console.error(
      `[main] Unknown source: "${source ?? ''}". Valid: ${SOURCES.map((s) => s.name).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  const browser = await launch({ headless: true });
  try {
    const options: CommonOptions = { browser, fetch };

    // Step 1: Build shared tagged URL pool
    const urls$: ReturnType<typeof merge<TaggedUrl>> = merge(
      ...activeSources.map((entry) =>
        entry.finder(options).pipe(
          filter((url) => (entry.urlFilter ? entry.urlFilter(url) : true)),
          map((url): TaggedUrl => ({ source: entry.name, url })),
        ),
      ),
    ).pipe(share());

    // Step 2: Build shared tagged data pool
    const data$ = merge(
      ...activeSources.map((entry) =>
        urls$.pipe(
          filter(({ source }) => source === entry.name),
          mergeMap(({ url }) =>
            entry.retriever({ url, ...options }).pipe(
              retry({ delay: 15 * 1000, count: 1 }),
              map((data): TaggedData => ({ source: entry.name, data })),
            ),
          ),
        ),
      ),
    ).pipe(share());

    // Step 3: Build pipeline streams from registry
    const pipelineStreams = activePipelines
      .filter((p) => p.sources.every((s) => activeSourceNames.has(s)))
      .map((entry) => {
        const filtered$ = data$.pipe(
          filter(({ source }) => entry.sources.includes(source)),
          map(({ data }) => data),
        );
        const processed$ = entry.processor
          ? filtered$.pipe(entry.processor)
          : filtered$;
        return processed$.pipe(entry.sink);
      });

    if (pipelineStreams.length === 0) {
      console.warn('[main] No active pipelines for the given source(s)');
      return;
    }

    // Step 4: Run all pipeline streams concurrently
    await lastValueFrom(merge(...pipelineStreams));

    await updateScraperMetadata('deputies', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('deputies', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const sourceArg = process.argv
  .find((arg) => arg.startsWith('--source='))
  ?.replace('--source=', '');

void runAll(sourceArg).catch((error: unknown) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});

export { runAll };
```

**Step 3: Type check**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors. Fix any type errors before proceeding — the
`as OperatorFunction<unknown, unknown>` casts on processors are intentional due
to the registry's `unknown` generic.

**Step 4: Lint**

```bash
pnpm --filter @congress/ingestion exec eslint src/main.ts --max-warnings 0
```

Expected: 0 warnings.

**Step 5: Commit**

```bash
git add apps/ingestion/src/main.ts && git commit -m "feat(ingestion): replace vertical pipelines with horizontal registry-based orchestrator"
```

---

### Task 3: Update `ScraperMetadata` — per-source tracking

**Context:** The old model called `updateScraperMetadata('deputies', ...)`,
`updateScraperMetadata('voting', ...)` etc. per pipeline. The new model has a
single top-level try/catch. This task updates the orchestrator to record
success/failure per active source name.

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Read the `updateScraperMetadata` signature**

Check `packages/database/src/queries/metadata.ts` to confirm the `ScraperType`
union. It currently includes:
`'bureau' | 'deputies' | 'initiatives' | 'interestDeclarations' | 'intervention' | 'parties' | 'voting'`.

**Step 2: Map source names to ScraperType**

The `SourceEntry.name` values don't exactly match `ScraperType` — e.g.
`'person'` vs `'deputies'`, `'interest-declarations'` vs
`'interestDeclarations'`. Add a mapping:

```ts
const SCRAPER_TYPE_MAP: Record<string, string> = {
  'person': 'deputies',
  'person-detail': 'deputies', // shares the same metadata key
  'voting': 'voting',
  'bureau': 'bureau',
  'intervention': 'intervention',
  'initiatives': 'initiatives',
  'interest-declarations': 'interestDeclarations',
};
```

Note: `person` and `person-detail` both map to `'deputies'` since they feed the
same entity. The party pipeline has its own metadata key `'parties'` — add a
`PipelineEntry.metadataKey?: string` field so the party pipeline can declare
`metadataKey: 'parties'`.

**Step 3: Update `runAll` success/failure reporting**

Replace the hardcoded `updateScraperMetadata('deputies', ...)` calls with
per-source calls using `SCRAPER_TYPE_MAP`. Deduplicate keys (don't call twice
for `'deputies'`).

**Step 4: Add `'parties'` metadata update**

The party pipeline has sources `['person', 'person-detail']` — add
`metadataKey: 'parties'` to that `PipelineEntry` and update the success/failure
logic to call `updateScraperMetadata('parties', ...)` for it.

**Step 5: Type check + lint**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
pnpm --filter @congress/ingestion exec eslint src/main.ts --max-warnings 0
```

**Step 6: Commit**

```bash
git add apps/ingestion/src/main.ts && git commit -m "feat(ingestion): per-source ScraperMetadata tracking in orchestrator"
```

---

### Task 4: Update integration tests

**Files:**

- Modify: `apps/ingestion/src/test/finders.test.ts`
- Modify: `apps/ingestion/src/test/retrievers.test.ts`

**Step 1: Read both test files**

The tests import and call individual finders/retrievers directly — they don't go
through `main.ts`. Check if any test imports from `main.ts` or references the
old `runXxxPipeline` exports.

**Step 2: Remove stale imports**

If any test file imports `runXxxPipeline` functions from `main.ts`, update to
import `runAll` instead, or remove if not used.

**Step 3: Type check**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/test/ && git commit -m "chore(ingestion): update tests after orchestrator refactor"
```

---

### Task 5: Update `package.json` scripts

**Files:**

- Modify: `apps/ingestion/package.json`

**Step 1: Read current scripts**

The current scripts include:

```json
"scrape": "tsx src/main.ts",
"scrape:person": "tsx src/main.ts --source=person",
"scrape:voting": "tsx src/main.ts --source=voting",
"scrape:intervention": "tsx src/main.ts --source=intervention",
"scrape:bureau": "tsx src/main.ts --source=bureau",
"scrape:parties": "tsx src/main.ts --source=parties",
```

**Step 2: Update scripts**

The `--source` flag still works with the new orchestrator using source entry
names. Update the scripts to use the correct new source names:

```json
"scrape": "tsx src/main.ts",
"scrape:person": "tsx src/main.ts --source=person",
"scrape:person-detail": "tsx src/main.ts --source=person-detail",
"scrape:voting": "tsx src/main.ts --source=voting",
"scrape:intervention": "tsx src/main.ts --source=intervention",
"scrape:bureau": "tsx src/main.ts --source=bureau",
"scrape:initiatives": "tsx src/main.ts --source=initiatives",
"scrape:interest-declarations": "tsx src/main.ts --source=interest-declarations",
```

Note: `scrape:parties` is removed — parties are now part of the full run.
Running `--source=person` activates the `person` source and the party pipeline
(which has `sources: ['person', 'person-detail']`) will only partially run since
`person-detail` is not active. This is acceptable for debug purposes.

**Step 3: Commit**

```bash
git add apps/ingestion/package.json && git commit -m "chore(ingestion): update scrape scripts for new orchestrator source names"
```

---

### Task 6: Verification — full type check and lint

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

**Step 3: Commit if any formatting fixes applied**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: fix lint/format after orchestrator refactor"
```

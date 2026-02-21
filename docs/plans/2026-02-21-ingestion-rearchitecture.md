# Ingestion Rearchitecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Complete the ingestion layer: delete dead code, wire all four scrapers
(person, voting, bureau, intervention) into DB sinks, implement watermark-based
change detection for voting and intervention, build a real intervention session
finder, replace Bree + Winston with simple CLI entry points.

**Architecture:** `main.ts` exports one standalone pipeline function per
scraper, plus a CLI router. Each pipeline: launch browser → finder → filter
needles (watermark) → retrieve → sink to DB → update `ScraperMetadata` → close
browser/disconnect DB. OS cron replaces Bree. `console.error` replaces Winston.

**Tech Stack:** Playwright, RxJS 7, Zod 4, Prisma 7 + better-sqlite3, TypeScript
strict ESM, pnpm workspaces.

**Design doc:** `docs/plans/2026-02-21-ingestion-rearchitecture-design.md`

---

## Task 0: Regenerate Prisma client

The `OrganMember` model was added to `schema.prisma` but the Prisma client has
not been regenerated. This causes `prisma.organMember` to not exist on the
client type, causing LSP errors in `organMembers.ts` (both query and
repository).

**Files:** (generated, not manually edited)

**Step 1: Regenerate**

```bash
pnpm --filter @congress/database db:generate
```

Expected: Prisma generates a new client with `prisma.organMember`. No errors.

**Step 2: Verify types**

```bash
pnpm --filter @congress/database lint:types
```

Expected: the `organMember does not exist` errors in `organMembers.ts` are gone.

**Step 3: Commit**

```bash
git add packages/database/node_modules/.prisma/client/ 2>/dev/null; true
# The generated client is likely gitignored — check with git status
git status packages/database/
```

If the generated client files are not gitignored, commit them:

```bash
git add packages/database/
git commit -m "chore(database): regenerate prisma client after OrganMember schema addition"
```

If they are gitignored (expected), no commit needed — the client will be
regenerated on install. Move to Task 1.

---

## Task 1: Fix pre-existing LSP errors

These must be fixed before any new work to keep lint passing.

**Files:**

- Modify: `apps/api/src/routes/bureaus.ts` — file should not exist; check if it
  was superseded by `organs.ts`
- Modify: `packages/database/src/repositories/deputies.ts`
- Modify: `apps/api/src/routes/speeches.ts`

**Step 1: Check what `bureaus.ts` is**

Read `apps/api/src/routes/bureaus.ts`. If it is a stale file that was supposed
to be deleted when `organs.ts` was created, delete it.

**Step 2: Fix `packages/database/src/repositories/deputies.ts`**

The error is: "Argument of type `number | undefined` is not assignable to
parameter of type `number`." Find the `parseSpanishDate`-style function that
splits a date string. The `parseInt` calls produce `number | undefined` because
array index access returns `T | undefined` under `noUncheckedIndexedAccess`.

Fix pattern:

```ts
// Before
const [day, month, year] = dateStr.split('/').map(Number);
return new Date(year!, month! - 1, day);

// After
const parts = dateStr.split('/').map(Number);
const day = parts[0];
const month = parts[1];
const year = parts[2];
if (day === undefined || month === undefined || year === undefined) return null;
return new Date(year, month - 1, day);
```

**Step 3: Fix `apps/api/src/routes/speeches.ts`**

The error is: "Object is possibly 'undefined'". Find line 89. Add a null check
or non-null assertion (use non-null assertion only if the value is guaranteed by
context).

**Step 4: Run type check**

```bash
pnpm --filter @congress/api lint:types
pnpm --filter @congress/database lint:types
```

Expected: zero errors.

**Step 5: Commit**

```bash
git add apps/api/src/ packages/database/src/repositories/deputies.ts
git commit -m "fix: resolve pre-existing LSP errors in api routes and deputies repository"
```

---

## Task 2: Add `getLastSuccessfulRun` and `getExistingSessionKeys` to database package

**Files:**

- Create: `packages/database/src/queries/metadata.ts`
- Modify: `packages/database/src/queries/votes.ts`
- Modify: `packages/database/src/queries/index.ts`
- Modify: `packages/database/src/repositories/metadata.ts`

**Step 1: Create `packages/database/src/queries/metadata.ts`**

```ts
import { prisma } from '../client.ts';

export type ScraperType = 'deputies' | 'voting' | 'bureau' | 'intervention';

export async function getLastSuccessfulRun(
  scraperType: ScraperType,
): Promise<Date | null> {
  const record = await prisma.scraperMetadata.findUnique({
    where: { scraperType },
    select: { lastSuccessfulRun: true },
  });

  return record?.lastSuccessfulRun ?? null;
}
```

**Step 2: Add `getExistingSessionKeys` to
`packages/database/src/queries/votes.ts`**

Append after the existing functions:

```ts
/**
 * Returns a Set of "legislature-sessionNumber" strings for all voting sessions
 * already in the database. Used by the voting pipeline to skip re-fetching
 * already-processed sessions (watermark).
 */
export async function getExistingSessionKeys(): Promise<Set<string>> {
  const sessions = await prisma.votingSession.findMany({
    select: { legislature: true, sessionNumber: true },
  });

  return new Set(
    sessions.map((s) => `${String(s.legislature)}-${String(s.sessionNumber)}`),
  );
}
```

**Step 3: Update `packages/database/src/queries/index.ts`**

Add after the last `export * from`:

```ts
export { getLastSuccessfulRun } from './metadata.ts';
export type { ScraperType } from './metadata.ts';
```

**Step 4: Update `packages/database/src/repositories/metadata.ts`**

Change the `scraperType` parameter union in `updateScraperMetadata` and
`getScraperMetadata` from `'deputies' | 'voting'` to the shared `ScraperType`
type from the queries:

```ts
import { prisma } from '../client.ts';

import type { ScraperMetadata } from '@prisma/client';
import type { ScraperType } from '../queries/metadata.ts';

export async function updateScraperMetadata(
  scraperType: ScraperType,
  success: boolean,
  error?: string,
): Promise<void> {
  // ... rest of implementation unchanged
}

export async function getScraperMetadata(): Promise<ScraperMetadata[]> {
  // ... unchanged
}
```

Note: `ScraperType` is imported as a type from `queries/metadata.ts` to avoid
circular dependencies (queries import from `client.ts`, not from
`repositories`). No circular dep introduced.

**Step 5: Verify types**

```bash
pnpm --filter @congress/database lint:types
```

Expected: zero errors.

**Step 6: Commit**

```bash
git add packages/database/src/queries/metadata.ts \
        packages/database/src/queries/votes.ts \
        packages/database/src/queries/index.ts \
        packages/database/src/repositories/metadata.ts
git commit -m "feat(database): add getLastSuccessfulRun query and getExistingSessionKeys for watermark"
```

---

## Task 3: Fix `sinks/database.ts` — rename `persistBureaus` → `persistOrganMembers`

**Files:**

- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`

**Step 1: Rename in `database.ts`**

Find the `persistBureaus` function. Make two changes:

1. Rename the function: `persistBureaus` → `persistOrganMembers`
2. Fix the log strings inside the function: change `[bureaus]` →
   `[organMembers]`

The function body already calls `upsertOrganMembers` (correct) — no change
needed there.

**Step 2: Update `sinks/index.ts`**

```ts
export {
  persistDeputies,
  persistVotes,
  persistSpeeches,
  persistOrganMembers,
  type PersistResult,
} from './database.ts';
```

**Step 3: Verify types**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: zero errors (no code outside sinks uses `persistBureaus` yet).

**Step 4: Commit**

```bash
git add apps/ingestion/src/sinks/
git commit -m "refactor(ingestion): rename persistBureaus to persistOrganMembers, fix log strings"
```

---

## Task 4: Rewrite `sources/intervention.ts` finder

**Context:** The current finder returns a hardcoded URL for a single session.
The new finder navigates the congreso.es intervention search, applies a date
filter from `lastSuccessfulRun`, paginates through results, and returns all
session URLs as `Needle[]`.

**How the congreso.es intervention search works (observed from the existing
URL):**

The search URL structure uses Liferay portlet parameters. A search with a date
range looks like:

```
https://www.congreso.es/es/busqueda-de-intervenciones
  ?p_p_id=intervenciones
  &p_p_lifecycle=0
  &_intervenciones_mode=busqueda
  &_intervenciones_legislatura=XV
  &_intervenciones_fecha_inicio=01/01/2024
  &_intervenciones_fecha_fin=31/12/2024
```

Each result row links to a session text URL with `_intervenciones_id_texto`
parameter. Sessions are paginated.

**Files:**

- Modify: `apps/ingestion/src/sources/intervention.ts`

**Step 1: Update the finder**

Replace the current `finder` function with:

```ts
const finder: Finder = async ({ browser, fetch: _fetch }) => {
  // Import getLastSuccessfulRun at top of file (see step 2)
  const lastRun = await getLastSuccessfulRun('intervention');

  const today = new Date();
  const dateFrom = lastRun ?? new Date(0); // epoch for full sync

  // Format dates as DD/MM/YYYY (congreso.es format)
  const formatDate = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };

  const page = await browser.newPage();
  const needles: Needle[] = [];

  try {
    // Navigate to the interventions search with date filter
    const searchUrl = new URL(
      'https://www.congreso.es/es/busqueda-de-intervenciones',
    );
    searchUrl.searchParams.set('p_p_id', 'intervenciones');
    searchUrl.searchParams.set('p_p_lifecycle', '0');
    searchUrl.searchParams.set('_intervenciones_mode', 'busqueda');
    searchUrl.searchParams.set('_intervenciones_legislatura', 'XV');
    searchUrl.searchParams.set(
      '_intervenciones_fecha_inicio',
      formatDate(dateFrom),
    );
    searchUrl.searchParams.set('_intervenciones_fecha_fin', formatDate(today));

    await page.goto(searchUrl.href, { waitUntil: 'networkidle' });

    // Collect all session links across pages
    let hasNextPage = true;

    while (hasNextPage) {
      // Extract session links on current page
      // Each result links to: busqueda-de-intervenciones?..._intervenciones_id_texto=(CVE)
      const links = await page
        .locator('a[href*="_intervenciones_id_texto"]')
        .all();

      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href) {
          const fullUrl = new URL(href, 'https://www.congreso.es').href;
          needles.push({ url: fullUrl });
        }
      }

      // Check for a "next page" pagination link
      const nextLink = page
        .locator('a[href*="intervenciones"][href*="paginaActual"]')
        .last();

      const nextHref = await nextLink.getAttribute('href').catch(() => null);

      if (nextHref) {
        await page.goto(new URL(nextHref, 'https://www.congreso.es').href, {
          waitUntil: 'networkidle',
        });
      } else {
        hasNextPage = false;
      }
    }
  } finally {
    await page.close();
  }

  return needles;
};
```

**Step 2: Add import for `getLastSuccessfulRun`**

At the top of `intervention.ts`, add to the imports:

```ts
import { getLastSuccessfulRun } from '@congress/database';
```

And add `Needle` to the import from `'./types'`:

```ts
import type { Finder, Needle, Retriever } from './types';
```

**Step 3: Verify types**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/sources/intervention.ts
git commit -m "feat(ingestion): implement real intervention session finder with date watermark"
```

---

## Task 5: Rewrite `main.ts`

This is the core task. `main.ts` becomes the single entry point for all manual
runs, exporting one pipeline function per scraper.

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Write the new `main.ts`**

```ts
import { lastValueFrom } from 'rxjs';

import { prisma, updateScraperMetadata } from '@congress/database';
import {
  getExistingSessionKeys,
  getLastSuccessfulRun,
} from '@congress/database';

import { launch, fetch } from './network/index.ts';
import {
  persistDeputies,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';
import * as bureau from './sources/bureau.ts';
import * as intervention from './sources/intervention.ts';
import * as person from './sources/person.ts';
import * as voting from './sources/voting.ts';

import type { Observable } from 'rxjs';
import type { Finder, Needle, Retriever } from './sources/types.ts';

// ---------------------------------------------------------------------------
// Pipeline runner helpers
// ---------------------------------------------------------------------------

async function findAll(
  finder: Finder,
  options: Parameters<Finder>[0],
): Promise<Needle[]> {
  const result = await finder(options);

  if (Array.isArray(result)) {
    return result.map((item) =>
      typeof item === 'object' ? item : { url: item },
    );
  }

  return [{ url: result as string }];
}

function retrieveAll<T>(
  retriever: Retriever<T>,
  needles: Needle[],
  options: Parameters<Finder>[0],
): Observable<T> {
  const { merge, retry } = require('rxjs') as typeof import('rxjs');

  return merge(
    ...needles.map((needle) =>
      retriever({ ...needle, ...options }).pipe(
        retry({ delay: 15 * 1000, count: 1 }),
      ),
    ),
  ) as Observable<T>;
}

// ---------------------------------------------------------------------------
// Person pipeline
// ---------------------------------------------------------------------------

export async function runPersonPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(person.finder, { browser, fetch });
    const stream = retrieveAll(person.retriever, needles, { browser, fetch });

    await lastValueFrom(stream.pipe(persistDeputies()));

    await updateScraperMetadata('deputies', true);
  } catch (error) {
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
// Voting pipeline
// ---------------------------------------------------------------------------

export async function runVotingPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const allNeedles = await findAll(voting.finder, { browser, fetch });

    // Watermark: filter out sessions already in DB
    const existingKeys = await getExistingSessionKeys();

    const newNeedles = allNeedles.filter((needle) => {
      // URL pattern: Leg{N}/Sesion{N}.json
      const match = /Leg(\d+)\/Sesion(\d+)/.exec(needle.url);
      if (!match) return true; // Keep if URL doesn't match expected pattern

      const leg = match[1];
      const sess = match[2];
      if (!leg || !sess) return true;

      const key = `${leg}-${parseInt(sess, 10).toString()}`;
      return !existingKeys.has(key);
    });

    console.log(
      `[voting] Found ${String(allNeedles.length)} sessions total, ${String(newNeedles.length)} new`,
    );

    if (newNeedles.length === 0) {
      console.log('[voting] No new sessions to process');
      await updateScraperMetadata('voting', true);
      return;
    }

    const stream = retrieveAll(voting.retriever, newNeedles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistVotes()));

    await updateScraperMetadata('voting', true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('voting', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Bureau pipeline
// ---------------------------------------------------------------------------

export async function runBureauPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(bureau.finder, { browser, fetch });
    const stream = retrieveAll(bureau.retriever, needles, { browser, fetch });

    await lastValueFrom(stream.pipe(persistOrganMembers()));

    await updateScraperMetadata('bureau', true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('bureau', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Intervention pipeline
// ---------------------------------------------------------------------------

export async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    // Finder reads lastSuccessfulRun internally (date watermark)
    const needles = await findAll(intervention.finder, { browser, fetch });

    console.log(
      `[intervention] Found ${String(needles.length)} sessions to process`,
    );

    if (needles.length === 0) {
      console.log('[intervention] No new sessions to process');
      await updateScraperMetadata('intervention', true);
      return;
    }

    const stream = retrieveAll(intervention.retriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistSpeeches()));

    await updateScraperMetadata('intervention', true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('intervention', false, message).catch(
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

const pipelines: Record<string, () => Promise<void>> = {
  person: runPersonPipeline,
  voting: runVotingPipeline,
  bureau: runBureauPipeline,
  intervention: runInterventionPipeline,
};

async function main(): Promise<void> {
  if (!sourceArg || sourceArg === 'all') {
    console.log('[main] Running all pipelines sequentially');
    for (const [name, run] of Object.entries(pipelines)) {
      console.log(`[main] Starting ${name} pipeline`);
      await run();
      console.log(`[main] Finished ${name} pipeline`);
    }
    return;
  }

  const run = pipelines[sourceArg];
  if (!run) {
    console.error(
      `[main] Unknown source: "${sourceArg}". Valid: ${Object.keys(pipelines).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  await run();
}

void main().catch((error) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});
```

Note: The `require('rxjs')` pattern for `merge` and `retry` avoids a top-level
import cycle (Observables are already constructed by the time these are called).
Better: import `merge` and `retry` at the top of the file normally:

```ts
import { lastValueFrom, merge, retry } from 'rxjs';
```

And use them directly in `retrieveAll`. Remove the `require` pattern.

**Step 2: Verify types**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit -m "feat(ingestion): rewrite main.ts with 4 pipeline functions and CLI router"
```

---

## Task 6: Delete dead code and remove unused dependencies

**Files to delete:**

- `apps/ingestion/src/detectors/` (entire directory)
- `apps/ingestion/src/models/` (entire directory)
- `apps/ingestion/src/processors/` (entire directory)
- `apps/ingestion/src/validators/` (entire directory)
- `apps/ingestion/src/main.backup.ts`
- `apps/ingestion/src/scheduler.ts`
- `apps/ingestion/src/jobs/` (entire directory)
- `apps/ingestion/src/logger.ts`

**Step 1: Delete files**

```bash
rm -rf apps/ingestion/src/detectors \
       apps/ingestion/src/models \
       apps/ingestion/src/processors \
       apps/ingestion/src/validators \
       apps/ingestion/src/main.backup.ts \
       apps/ingestion/src/scheduler.ts \
       apps/ingestion/src/jobs \
       apps/ingestion/src/logger.ts
```

**Step 2: Remove unused dependencies from `package.json`**

Open `apps/ingestion/package.json` and remove from `dependencies`:

- `bree`
- `winston`
- `winston-daily-rotate-file`

Also remove from `devDependencies` if present:

- `@types/bree`

**Step 3: Uninstall**

```bash
pnpm --filter @congress/ingestion remove bree winston winston-daily-rotate-file
```

**Step 4: Check for remaining references**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: zero errors. If there are import errors from deleted files, those are
references that should have been cleaned up in earlier tasks — fix them now.

**Step 5: Commit**

```bash
git add apps/ingestion/
git commit -m "chore(ingestion): delete dead code, remove bree + winston dependencies"
```

---

## Task 7: Full lint check across all packages

**Step 1: Run CI lint on all packages**

```bash
pnpm --filter @congress/database lint:ci
pnpm --filter @congress/api lint:ci
pnpm --filter @congress/ingestion lint:ci
```

Expected: all pass with zero warnings.

**Step 2: Fix any remaining issues**

If there are any lint warnings or errors:

- Type errors: fix the narrowing issue at the reported location
- Style errors (ESLint): fix imports order, trailing commas, etc.
- Format errors: run `pnpm --filter <package> format` then re-run `lint:ci`

**Step 3: Commit fixes (if any)**

```bash
git add .
git commit -m "fix: resolve lint warnings from ingestion rearchitecture"
```

---

## Completion Checklist

After all tasks:

- [ ] `pnpm --filter @congress/database lint:ci` passes
- [ ] `pnpm --filter @congress/api lint:ci` passes
- [ ] `pnpm --filter @congress/ingestion lint:ci` passes
- [ ] `pnpm --filter @congress/ingestion scrape:person` runs without import
      errors
- [ ] `pnpm --filter @congress/ingestion scrape:voting` runs without import
      errors
- [ ] `pnpm --filter @congress/ingestion scrape:bureau` runs without import
      errors
- [ ] `pnpm --filter @congress/ingestion scrape:intervention` runs without
      import errors
- [ ] No `bree`, `winston`, or `logger.ts` references remain in ingestion
- [ ] No `detectors/`, `models/`, `processors/`, `validators/` directories
      remain

## Notes on Browser Testing

The `runPersonPipeline`, `runBureauPipeline`, and `runInterventionPipeline`
functions launch a real browser and navigate congreso.es. They can only be fully
tested by running them. To verify they work end-to-end:

```bash
# Test person pipeline (fast, ~350 records)
pnpm --filter @congress/ingestion scrape:person

# Test bureau pipeline (moderate, ~1000 records)
pnpm --filter @congress/ingestion scrape:bureau

# Test intervention pipeline (variable, finds sessions since last run)
pnpm --filter @congress/ingestion scrape:intervention
```

Expect log output showing batch counts and success/skipped numbers. Any
`[ERROR]` lines indicate scraper issues that need debugging against the live
site.

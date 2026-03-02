# Intervention Watermark: Move to Orchestration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Move the date watermark out of the intervention finder and into
`runInterventionPipeline` in `main.ts`, so the finder is a pure URL discoverer
with no DB dependency.

**Architecture:** Strip the finder down to a scraper; add
`LEGISLATURE_XV_START`, `parseSpanishDate`, and the `getLastSuccessfulRun` call
to the orchestration, mirroring the voting pipeline pattern.

**Tech Stack:** TypeScript, Playwright, RxJS, Prisma (`@congress/database`)

---

### Task 1: Strip watermark logic from the intervention finder

**Files:**

- Modify: `apps/ingestion/src/finders/intervention.ts`

**Step 1: Remove the DB import, constants, helpers, and filtering**

Replace the entire file content with:

```ts
import type { Finder, Needle } from '../types.ts';

interface BulkInterventionRow {
  LEGISLATURA: string;
  OBJETOINICIATIVA: string;
  SESION: string; // DD/MM/YYYY
  ORGANO: string;
  FASE: string;
  TIPOINTERVENCION: string;
  ORADOR: string;
  CARGOORADOR: string;
  INICIOINTERVENCION: string;
  FININTERVENCION: string;
  ENLACEDIFERIDO: string;
  ENLACEDESCARGADIRECTA: string;
  ENLACETEXTOINTEGRO: string;
  ENLACEPDF: string;
}

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
      waitUntil: 'networkidle',
    });

    const href = await page
      .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
      .first()
      .getAttribute('href');

    if (!href) {
      throw new Error(
        '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
      );
    }

    const url = new URL(href, 'https://www.congreso.es').href;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `[intervention] Failed to fetch bulk JSON: ${response.status.toString()} ${response.statusText}`,
      );
    }

    const rows = (await response.json()) as BulkInterventionRow[];

    const seen = new Set<string>();
    const needles: Needle[] = [];

    for (const row of rows) {
      if (!row.ENLACETEXTOINTEGRO) continue;
      if (seen.has(row.ENLACETEXTOINTEGRO)) continue;

      seen.add(row.ENLACETEXTOINTEGRO);
      needles.push({ url: row.ENLACETEXTOINTEGRO, extra: row });
    }

    console.log(
      `[intervention] Found ${String(needles.length)} unique session pages`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkInterventionRow };
export { finder };
```

**Step 2: Run lint to verify**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/intervention.ts
git commit --no-gpg-sign -m "refactor(ingestion): remove watermark from intervention finder"
```

---

### Task 2: Move watermark into the orchestration

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Add `BulkInterventionRow` to the intervention finder import**

Change:

```ts
import { finder as interventionFinder } from './finders/intervention.ts';
```

To:

```ts
import { finder as interventionFinder } from './finders/intervention.ts';
import type { BulkInterventionRow } from './finders/intervention.ts';
```

Note: keep the value import and add the type import on a separate line below it,
per the import ordering rules (type imports last in their group).

**Step 2: Add `LEGISLATURE_XV_START` and `parseSpanishDate` near the top of
`main.ts`**

Add after the imports block (before the first pipeline function):

```ts
const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date {
  const parts = ddmmyyyy.split('/');
  const dd = parts[0] ?? '01';
  const mm = parts[1] ?? '01';
  const yyyy = parts[2] ?? '1970';
  const date = new Date(`${yyyy}-${mm}-${dd}`);

  if (isNaN(date.getTime())) {
    console.warn(`[intervention] Could not parse date: ${ddmmyyyy}`);
    return new Date(0);
  }

  return date;
}
```

**Step 3: Replace `runInterventionPipeline` with the watermark-aware version**

Replace:

```ts
async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    // Finder reads lastSuccessfulRun internally (date watermark)
    const needles = await findAll(interventionFinder, { browser, fetch });

    console.log(
      `[intervention] Found ${String(needles.length)} sessions to process`,
    );

    if (needles.length === 0) {
      console.log('[intervention] No new sessions to process');
      await updateScraperMetadata('intervention', true);
      return;
    }

    const stream = retrieveAll(interventionRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistSpeeches()));

    await updateScraperMetadata('intervention', true);
  } catch (error: unknown) {
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
```

With:

```ts
async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const lastRun = await getLastSuccessfulRun('intervention');
    const dateFrom = lastRun ?? LEGISLATURE_XV_START;

    const allNeedles = await findAll(interventionFinder, { browser, fetch });

    const newNeedles = allNeedles.filter((needle) => {
      const row = needle.extra as BulkInterventionRow;
      return parseSpanishDate(row.SESION) > dateFrom;
    });

    console.log(
      `[intervention] Found ${String(allNeedles.length)} sessions total, ${String(newNeedles.length)} new`,
    );

    if (newNeedles.length === 0) {
      console.log('[intervention] No new sessions to process');
      await updateScraperMetadata('intervention', true);
      return;
    }

    const stream = retrieveAll(interventionRetriever, newNeedles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistSpeeches()));

    await updateScraperMetadata('intervention', true);
  } catch (error: unknown) {
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
```

**Step 4: Run lint to verify**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 5: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit --no-gpg-sign -m "refactor(ingestion): move intervention date watermark into orchestration"
```

---

### Task 3: Verify integration tests still pass

**Step 1: Run finder integration tests**

```bash
pnpm --filter @congress/ingestion test:integration
```

Expected: all finders pass (intervention will now return all needles since
`LEGISLATURE_XV_START` but that is fine — the test only asserts `length > 0`).

**Step 2: Run retriever integration tests**

```bash
pnpm --filter @congress/ingestion test:retrievers
```

Expected: all retrievers pass.

**Step 3: Run lint one final time**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

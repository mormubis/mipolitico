# Intervention Watermark: Move to Orchestration — Design

## Problem

The intervention finder currently calls `getLastSuccessfulRun('intervention')`
internally and filters the bulk JSON to only return needles newer than the last
successful run. This violates the finder's contract: a finder should be a pure
URL discoverer with no side effects and no DB dependencies.

The voting pipeline already demonstrates the correct pattern: the orchestration
calls `getExistingSessionKeys()` after the finder, then filters needles before
passing them to the retriever. Intervention should follow the same structure.

## Design

### Intervention finder (`src/finders/intervention.ts`)

Remove all watermark logic:

- Drop the `getLastSuccessfulRun` import and call
- Drop `LEGISLATURE_XV_START` constant
- Drop `parseSpanishDate` helper
- Drop the `sessionDate <= dateFrom` filter
- Return every needle that has a non-empty `ENLACETEXTOINTEGRO`

The finder becomes a pure scraper: navigate, fetch bulk JSON, emit needles.

### Orchestration (`src/main.ts`)

Move the watermark into `runInterventionPipeline`, mirroring the voting
pipeline:

```ts
const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date { ... }

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

    if (newNeedles.length === 0) { ... }

    const stream = retrieveAll(interventionRetriever, newNeedles, { browser, fetch });
    await lastValueFrom(stream.pipe(persistSpeeches()));
    await updateScraperMetadata('intervention', true);
  } catch { ... }
}
```

### Type import

`BulkInterventionRow` must be imported from the finder file in `main.ts` since
the `extra` field needs casting for the date filter.

## What does NOT change

- `FinderOptions` stays as `CommonOptions` only (no `dateFrom`)
- The `getLastSuccessfulRun` DB function is unchanged
- All other pipelines are untouched
- The finders test no longer needs any workaround for the intervention finder

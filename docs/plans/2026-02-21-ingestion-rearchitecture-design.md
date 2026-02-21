# Ingestion Rearchitecture Design — 2026-02-21

## Context

The ingestion layer has an incomplete implementation. Two eras of code coexist:

1. **Old era** (`main.backup.ts`, `detectors/`, `models/`, `processors/`,
   `validators/`): An over-engineered service-oriented design that was abandoned
   and never completed. Dead code.

2. **New era** (`main.ts`, `sources/`, `sinks/`, `network/`, `jobs/`): A lean
   RxJS pipeline design (Finder → Retriever → Observable → Sink). Correct
   architecture, but incomplete.

**Specific problems in the new era:**

- `main.ts` only runs the intervention scraper and doesn't persist to DB (just
  `console.log`)
- `jobs/deputies.ts` and `jobs/voting.ts` import `runPersonStandalone` /
  `runVotingStandalone` from `main.ts` — these functions do not exist; the jobs
  would crash
- `package.json` defines `scrape:person`, `scrape:voting`, etc. with
  `--source=X` flags, but `main.ts` ignores all arguments
- `detectors/`, `models/`, `processors/`, `validators/` are vestiges of the old
  era; `main.backup.ts` is an abandoned entry point
- `logger.ts` only accepts `'deputies' | 'voting'` as scraper types
- `sinks/database.ts` has `persistBureaus` logging `[bureaus]` while calling
  `upsertOrganMembers`
- `repositories/metadata.ts` only accepts `'deputies' | 'voting'` scraper types
- The intervention finder is a hardcoded single-session URL

---

## Design Decisions

### Scheduling: OS cron replaces Bree

Bree runs jobs in worker threads. Playwright browsers run as child processes
that communicate via IPC from the parent process. Worker threads + Playwright is
an unusual and fragile combination.

**Decision:** Remove Bree. The ingestion service is not a long-running daemon.
Each `scrape:*` script is an isolated process run. OS cron (or any external
scheduler — GitHub Actions, Fly.io machines, etc.) handles scheduling.

**Implication:** Delete `scheduler.ts` and the entire `jobs/` directory.

### Logger: Remove Winston

Winston + `winston-daily-rotate-file` is heavy for a scraper that runs a few
times a day. The `ScraperMetadata` DB table already captures `lastError` and
`attemptCount` — structured failure records exist in the DB.

**Decision:** Remove Winston. Use `console.error` for runtime output. Remove
`logger.ts` entirely.

**Downstream:** `jobs/deputies.ts` and `jobs/voting.ts` imported from
`logger.ts`; these files are deleted anyway (Bree removed).

**Package:** Remove `winston` and `winston-daily-rotate-file` from
`package.json` dependencies.

### Change Detection: Watermark for voting + intervention; upsert-always for person + bureau

| Source       | Volume                             | Change frequency                | Strategy                              |
| ------------ | ---------------------------------- | ------------------------------- | ------------------------------------- |
| Person       | ~350 records                       | Daily (new deputies, changes)   | Upsert-always                         |
| Voting       | 100s of JSON files, 1000s of votes | New files added continuously    | Watermark                             |
| Bureau       | ~1000 records                      | Weekly                          | Upsert-always                         |
| Intervention | Unbounded sessions                 | New sessions added continuously | Watermark (via date filter in finder) |

**Voting watermark:** The pipeline function queries the DB for all existing
`(legislature, sessionNumber)` pairs before running the finder. After the finder
returns all session needles, the pipeline filters out already-processed
sessions.

**Intervention watermark:** The finder itself reads `lastSuccessfulRun` from
`ScraperMetadata` and applies a `fecha_desde` date filter when navigating the
congreso.es intervention search. Only sessions after the last successful run are
returned as needles.

### Intervention Finder: Real browser-based session discovery

The current hardcoded URL is replaced with a real finder that:

1. Navigates to `https://www.congreso.es/es/busqueda-de-intervenciones`
2. Reads `lastSuccessfulRun` from `ScraperMetadata` and sets `fecha_desde` to
   that date (or epoch for a full sync)
3. Iterates through paginated results
4. Extracts all session text URLs (pattern:
   `busqueda-de-intervenciones?..._intervenciones_id_texto=(CVE)`)
5. Returns them as `Needle[]`

The finder stays within the `sources/intervention.ts` file. It uses the browser
(already a dependency) for navigation. No fetch-only alternative is used,
ensuring changes to the site structure surface as scraper errors immediately.

---

## File-by-file Changes

### Deleted

```
apps/ingestion/src/detectors/
apps/ingestion/src/models/
apps/ingestion/src/processors/
apps/ingestion/src/validators/
apps/ingestion/src/main.backup.ts
apps/ingestion/src/scheduler.ts
apps/ingestion/src/jobs/          (entire directory)
apps/ingestion/src/logger.ts
```

### Modified: `apps/ingestion/src/sinks/database.ts`

- Rename `persistBureaus` → `persistOrganMembers`
- Fix log strings: `[bureaus]` → `[organMembers]`
- Export name updated in `sinks/index.ts`

### Modified: `apps/ingestion/src/sources/intervention.ts`

Replace the hardcoded-URL finder with a real browser-based session discovery
finder (see above). The retriever is unchanged.

### Rewritten: `apps/ingestion/src/main.ts`

The new `main.ts`:

```
main.ts
  ├── runPersonPipeline()      → person source → persistDeputies
  ├── runVotingPipeline()      → voting source → persistVotes (with watermark)
  ├── runBureauPipeline()      → bureau source → persistOrganMembers
  ├── runInterventionPipeline()→ intervention source → persistSpeeches (with watermark)
  └── CLI router               → --source=person|voting|bureau|intervention|all
```

Each pipeline function:

1. Launches a browser via `network/browser.ts`
2. Runs the finder with `{ browser, fetch }`
3. Applies needle filtering (watermark for voting; finder handles it for
   intervention)
4. Constructs the retriever Observable stream
5. Pipes through the appropriate sink operator
6. Awaits `lastValueFrom(stream)` to completion
7. Updates `ScraperMetadata` on success
8. In `finally`: closes browser, disconnects `prisma`
9. On error: sets `process.exitCode = 1`, updates `ScraperMetadata` with error

Browser lifecycle: each pipeline function manages its own browser. No browser is
shared across pipeline functions. This matches the isolated-process model.

### Modified: `apps/ingestion/package.json`

Remove: `winston`, `winston-daily-rotate-file`, `bree`

Keep: `rxjs`, `playwright`, `oboe`, `p-limit`, `p-defer`, `zod`,
`@congress/database`

### Modified: `packages/database/src/repositories/metadata.ts`

Expand `scraperType` union from `'deputies' | 'voting'` to
`'deputies' | 'voting' | 'bureau' | 'intervention'`.

### New: `packages/database/src/queries/metadata.ts`

Add `getLastSuccessfulRun(scraperType)` → returns `Date | null`.

Used by the intervention finder and the voting watermark.

### Modified: `packages/database/src/queries/votes.ts`

Add `getExistingSessionKeys()` → returns a `Set<string>` of
`"${legislature}-${sessionNumber}"` strings.

Used by the voting pipeline for watermark filtering.

### Modified: `packages/database/src/queries/index.ts`

Export the new metadata query functions.

---

## Architecture Summary

```
ingestion/src/
  sources/           ← unchanged (finder + retriever pairs)
    bureau.ts
    intervention.ts  ← finder rewritten; retriever unchanged
    person.ts
    person-detail.ts ← out of scope for this rearchitecture
    voting.ts
  sinks/
    database.ts      ← rename persistBureaus → persistOrganMembers
    index.ts
  network/           ← unchanged
  main.ts            ← rewritten: 4 pipeline functions + CLI router

  [DELETED]
  detectors/
  models/
  processors/
  validators/
  main.backup.ts
  scheduler.ts
  jobs/
  logger.ts
```

The `package.json` `scrape:*` scripts remain unchanged and work with the new
`main.ts` CLI routing.

---

## Out of Scope

- `sources/person-detail.ts` — the per-deputy detail scraper (visits each
  deputy's individual page). Not part of this rearchitecture; it has no
  corresponding sink or pipeline function yet.
- Interest declarations scraper — no source file exists yet.
- Entity resolution — matching `Vote.deputyName` / `Speech.speakerName` to
  `Person` records post-ingestion.

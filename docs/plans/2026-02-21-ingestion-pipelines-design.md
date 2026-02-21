# Ingestion Pipelines Design

Date: 2026-02-21

## Context

The ingestion app (`@congress/ingestion`) scrapes data from congreso.es and
persists it to the database via Prisma repositories. Four pipelines already
exist: `person`, `voting`, `bureau`, `intervention`.

This document covers:

1. Refactoring the `sources/` folder into a flat structure of `finders/`,
   `retrievers/`, and `processors/`
2. Adding an **initiatives** pipeline
3. Adding an **interest declarations** pipeline

## Folder Structure

### Current

```
apps/ingestion/src/
  sources/
    types.ts
    person.ts           (finder + retriever co-located)
    bureau.ts
    voting.ts
    intervention.ts
    person-detail.ts
  sinks/
    database.ts
    index.ts
  main.ts
```

### Target

```
apps/ingestion/src/
  finders/
    person.ts
    bureau.ts
    voting.ts
    intervention.ts
    personDetail.ts
    initiatives.ts      ← new
  retrievers/
    person.ts
    bureau.ts
    voting.ts
    intervention.ts
    personDetail.ts
    initiatives.ts      ← new
    interestDeclarations.ts  ← new
  processors/
    interestDeclarations.ts  ← stub (identity pass-through)
  sinks/
    database.ts         (add persistInitiatives, persistInterestDeclarations)
    index.ts
  types.ts              (moved from sources/types.ts)
  main.ts
```

Types that were in `sources/types.ts` move to `types.ts` at the `src/` root. A
`Processor<T, U>` type is added alongside `Finder`, `Retriever`, `Source`.

## Pipeline Stages

Every pipeline is composed of up to four stages:

```
finder → retriever → [processor?] → sink
```

| Stage     | Type                         | Purpose                                      |
| --------- | ---------------------------- | -------------------------------------------- |
| Finder    | `Finder`                     | Discovers URLs to scrape; returns `Needle[]` |
| Retriever | `Retriever<T>`               | Fetches each URL; streams typed records      |
| Processor | `Processor<T, U>` (optional) | Transforms records before persistence        |
| Sink      | RxJS operator                | Buffers records and writes to database       |

The `Processor<T, U>` type is an RxJS `OperatorFunction<T, U>` — it fits
naturally into the existing `.pipe()` chain in `main.ts`.

## Commit Plan

### Commit 1 — Refactor sources/

- Split each file in `sources/` into `finders/<name>.ts` and
  `retrievers/<name>.ts`
- Move shared types from `sources/types.ts` to `types.ts`
- Add `Processor<T, U>` type
- Update all imports in `main.ts` and job files
- Delete `sources/` directory
- No behavior change

### Commit 2 — Initiatives pipeline

**Finder** (`finders/initiatives.ts`):

- Uses Playwright to navigate `https://www.congreso.es/es/opendata/iniciativas`
- Discovers timestamped JSON download URLs for four categories:
  `IniciativasLegislativasAprobadas`, `ProyectosDeLey`, `PropuestasDeReforma`,
  `ProposicionesDeLey`
- Returns one `Needle` per URL (no `extra` needed)

**Retriever** (`retrievers/initiatives.ts`):

- Fetches each JSON URL via `fetch`
- Streams the root array via `oboe` on `!.*`
- Injects `LEGISLATURE: 15` into each record
- Validates against `InitiativeInputSchema` (Zod)
- Emits one `InitiativeInput` per item

**Sink** (`sinks/database.ts` — `persistInitiatives`):

- `bufferCount(500)` → `mergeMap(batch => upsertInitiatives(batch))`
- Emits `PersistResult` on complete
- Follows existing `persistDeputies` pattern

**Pipeline** (`main.ts` — `runInitiativesPipeline`):

- Follows the same structure as existing pipelines
- No watermark needed (full replace on each run is acceptable)

**Job** (`jobs/initiatives.ts`):

- Standalone Bree job that calls `runInitiativesPipeline`

### Commit 3 — Interest declarations pipeline

**Retriever** (`retrievers/interestDeclarations.ts`):

- Reuses `personDetail` finder (no new finder needed)
- Maps each emitted person-detail record to
  `{ DEPUTY_ID, YEAR, PDF_URL: DECLARACION_BIENES_URL }`
- `YEAR` is derived from the current calendar year at scrape time

**Processor** (`processors/interestDeclarations.ts`):

- Stub identity pass-through: `(source) => source`
- Documents the extension point for future PDF parsing
- No-op at this stage

**Sink** (`sinks/database.ts` — `persistInterestDeclarations`):

- `mergeMap(record => upsertInterestDeclaration(record))`
- No batching (one upsert per deputy, each in its own transaction)
- Emits `PersistResult` on complete

**Pipeline** (`main.ts` — `runInterestDeclarationsPipeline`):

- Uses `personDetail` finder + `interestDeclarations` retriever +
  `interestDeclarations` processor + `persistInterestDeclarations` sink

**Job** (`jobs/interestDeclarations.ts`):

- Standalone Bree job that calls `runInterestDeclarationsPipeline`

## Data Sources

| Pipeline              | Source URL                                         | Method                           |
| --------------------- | -------------------------------------------------- | -------------------------------- |
| Initiatives           | `https://www.congreso.es/es/opendata/iniciativas`  | Playwright page nav + fetch      |
| Interest declarations | `https://www.congreso.es/es/busqueda-de-diputados` | Playwright (reuses personDetail) |

## Future Work

- PDF parsing processor for `interestDeclarations`: download
  `DECLARACION_BIENES_URL`, extract structured financial data (real estate, bank
  accounts, securities, income sources), populate the full
  `InterestDeclarationInputSchema`
- Watermarking for initiatives (scrape only new/changed records)

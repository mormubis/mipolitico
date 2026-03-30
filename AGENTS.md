# AGENTS.md — Coding Agent Reference

## Repository Overview

Monorepo for **MiPolítico** — a Spanish Congress open data platform. Uses **pnpm
workspaces** and **Nx** for task orchestration.

For Spanish Congress political terminology (Electoral Formation, Parliamentary
Group, Party) see [GLOSSARY.md](./GLOSSARY.md).

```
apps/
  api/         @congress/api      — Fastify REST API
  ingestion/   @congress/ingestion — Playwright-based data scraper + scheduler
packages/
  database/    @congress/database  — Prisma ORM client, repositories, validation
```

---

## Commands

### Package Manager

Always use **pnpm**. Never use npm or yarn.

```bash
pnpm install                    # install all workspace dependencies
```

### Naming Conventions

- **Files**: `kebab-case.ts` for modules.
- **Functions**: `camelCase`. Exported functions describe their action:
  `registerDeputyRoutes`, `upsertDeputies`, `findDeputyById`.
- **Types/Interfaces**: `PascalCase`. Prefer `type` over `interface` unless you
  need declaration merging.
- **Constants**: `UPPER_SNAKE_CASE` for module-level config objects or for true
  constants (e.g., `JOBS`).
- **Zod schemas**: suffix with `Schema` — `deputyQuerySchema`,
  `PersonInputSchema`.

### Async Patterns

- Prefer `async/await` over raw Promise chains.
- Use `rxjs` Observables for streaming data pipelines in ingestion
  (`Observable`, `merge`, `retry`).
- Wrap top-level `async` entry points with `void main()` (never await at the
  module top-level without wrapping).

---

## Database Architecture Principles

### Enrichment before storage

All entity resolution and enrichment must happen **before** data reaches the
repository — in a processor or the retriever itself. Repositories are pure write
operations: they receive complete, resolved records and persist them. They never
perform lookups, joins, or business logic.

This means:

- Processors handle entity resolution (e.g. resolving `codParlamentario` →
  `Deputy.id`)
- Pipeline order is explicit: `deputy` must run before `deputy-detail` or
  `bureau` so that `Person` records exist when dependent pipelines resolve
  foreign keys
- Never store partial data with the intent to enrich it later — enrich first,
  store once

---

## Ingestion Architecture Principles

These principles were established through analysis of the finders and
retrievers. Follow them when adding or modifying ingestion pipelines.

### Finder contract

- A finder emits **only URLs** — no fetching, filtering, business logic, or
  database access. If it opens a browser page, it navigates, collects links, and
  closes. Nothing more.
- Finders scope to the **current legislature** by default. The page usually
  handles this natively (labels like "de la legislatura actual"). If not, use
  `CURRENT_LEGISLATURE` from `config/legislature.ts`.
- Discover links **dynamically** from the page rather than hardcoding category
  lists. Hardcoded lists silently miss new categories.

### Finder/retriever split pattern

- Follow the `deputy` / `deputy-detail` pattern when a source has both bulk
  metadata and per-record detail pages:
  - `{entity}` finder → single bulk JSON URL → `{entity}` retriever streams it
    with `oboe`, emitting one record per row (no Playwright)
  - `{entity}-detail` finder → one profile URL per record → `{entity}-detail`
    retriever scrapes each page with Playwright for detail not in the bulk JSON
- Before reaching for Playwright, **check the opendata page first**. Congress
  often exposes full structured JSON (speaker, date, session, organ, timestamps,
  video links) that makes HTML scraping unnecessary.

### Retriever contract

- A retriever receives one URL and emits one or more typed records. It does not
  filter, watermark, or apply business logic — that belongs in a processor or
  the pipeline orchestrator.
- Bulk JSON retrievers use `oboe` streaming +
  `validate(Schema, validationMode)`.
- Playwright retrievers construct records manually and do not need `validate()`.
- All `catch` blocks wrap errors with `new Error(\`Failed to process \${url}:
  ...\`)`.

### Avoiding duplication

- If two pipelines scrape the same page for the same data, one of them is wrong.
  Extract the shared scraping into a dedicated `{entity}-detail` pipeline.
- Never scrape the same field from both a bulk JSON and a detail page — pick one
  source of truth.

---

## Ingestion Rate Limiting

The congreso.es server blocks IPs that send too many requests in a short period.
The block is broad (affects all subdomains and endpoints) and lasts at least 30
minutes. Signs of blocking: `HTTP/2 403` from all congreso.es URLs.

- The network pool (`src/network/pool.ts`) limits to 5 concurrent requests with
  1–5 second random delays. This may be insufficient for a full run.
- Fetch-based pipelines (deputy, initiative, declaration, intervention) are less
  likely to trigger blocks than Playwright-based ones (voting, bureau,
  deputy-detail, intervention-detail) which load full HTML pages.
- When developing, run individual sources (`--source=deputy`) rather than a full
  run to avoid triggering the block.
- If blocked, wait at least 30 minutes before retrying.

---

## Pre-commit Hooks

`lint-staged` runs on every commit (via Husky):

- All files: `prettier --write`
- `*.{js,mjs,cjs,ts,tsx}`: `eslint --fix --max-warnings 0`

Ensure lint and format pass before committing. CI uses `lint:ci` (zero warnings
tolerance).

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

### Development

```bash
# API server
pnpm --filter @congress/api dev           # tsx watch mode

# Ingestion
pnpm --filter @congress/ingestion scrape               # all sources
pnpm --filter @congress/ingestion scrape:person
pnpm --filter @congress/ingestion scrape:voting
pnpm --filter @congress/ingestion scrape:intervention
pnpm --filter @congress/ingestion scrape:bureau
```

### Build

```bash
pnpm --filter @congress/api build         # tsc compile
nx build @congress/api                    # with Nx caching
nx run-many -t build                      # build all packages
```

### Lint & Format

```bash
# Lint (style + types) — run from package root
pnpm --filter <package> lint              # with auto-fix
pnpm --filter <package> lint:ci           # strict, no warnings allowed
pnpm --filter <package> lint:style        # eslint only
pnpm --filter <package> lint:types        # tsc --noEmit only

# Format
pnpm --filter <package> format            # prettier with --write
pnpm --filter <package> format:ci         # check only (list-different)
```

### Tests

No test framework is currently configured — `test` scripts exit 1. The database
package has an integration test:

```bash
# Integration test (database package only)
pnpm --filter @congress/database test:integration
# Runs: node src/test/integration.test.ts
```

### Database

```bash
pnpm --filter @congress/database db:generate   # prisma generate
pnpm --filter @congress/database db:push       # push schema to dev db
pnpm --filter @congress/database db:migrate    # deploy migrations
pnpm --filter @congress/database db:studio     # open Prisma Studio
```

---

## Code Style

### TypeScript

- **Strict mode** is on: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`.
- `verbatimModuleSyntax` is enabled — all type-only imports must use
  `import type`.
- Target: `ESNext`. All packages are `"type": "module"` (ESM only).
- No `noEmit` in production builds; `noEmit: true` in root tsconfig for
  type-checking only.
- Avoid `any`. Prefer `unknown` for untrusted data; use Zod to validate and
  narrow.

### Imports

Rules are enforced by `eslint-plugin-import-x`:

1. **Type imports must be separate** and at the bottom of the import block:
   ```ts
   import { foo } from './foo.ts'; // value import
   import type { Foo } from './foo.ts'; // type import — top-level style
   ```
2. **Group order** (enforced, `newlines-between: always`):
   - `builtin` / `external`
   - `internal` (paths matching `~/**`)
   - `parent` / `sibling`
   - `type`
3. **Alphabetize** within groups (case-insensitive, ascending).
4. **Always include `.ts` extension** in relative imports within `src/`:
   ```ts
   import { config } from './config.ts'; // correct
   import { config } from './config'; // wrong
   ```
5. **No default exports** in `src/**/*.{ts,mts}`. Use named exports only.
6. **Exports last** in a file (after all other statements).

### Formatting (Prettier)

- Single quotes (`singleQuote: true`).
- `quoteProps: 'consistent'` — all or none in object literals.
- `proseWrap: 'always'` for markdown.
- Trailing commas, semicolons: Prettier defaults (trailing commas in ES5
  positions).

### Naming Conventions

- **Files**: `camelCase.ts` for modules, `kebab-case` not used in this repo.
- **Functions**: `camelCase`. Exported functions describe their action:
  `registerDeputyRoutes`, `upsertDeputies`, `findDeputyById`.
- **Types/Interfaces**: `PascalCase`. Prefer `type` over `interface` unless you
  need declaration merging.
- **Constants**: `camelCase` for module-level config objects, `UPPER_SNAKE_CASE`
  for true constants (e.g., `JOBS`).
- **Zod schemas**: suffix with `Schema` — `deputyQuerySchema`,
  `PersonInputSchema`.

### Error Handling

- Use `try/finally` for cleanup (browser close, DB disconnect).
- In async contexts, propagate errors upward; set `process.exitCode = 1` rather
  than calling `process.exit(1)` inside async functions where possible.
- In Fastify routes, throw or return structured error objects
  `{ error: string, status: number }`.
- Validate all external data with **Zod** (`safeParse` for non-throwing, `parse`
  where failure is exceptional).
- Log unexpected errors via the Fastify logger (`request.log.error`) or Winston
  in ingestion.

### Async Patterns

- Prefer `async/await` over raw Promise chains.
- Use `rxjs` Observables for streaming data pipelines in ingestion
  (`Observable`, `merge`, `retry`).
- `lastValueFrom` converts Observables to Promises at pipeline boundaries.
- Wrap top-level `async` entry points with `void main()` (never await at the
  module top-level without wrapping).

---

## Architecture Patterns

### API (`@congress/api`)

- **Fastify** with plugins: helmet, cors, swagger, swagger-ui.
- Routes are registered via `register<Entity>Routes(app)` functions — one file
  per entity.
- Query params validated with **Zod** schemas (`src/schemas/query.ts`), OpenAPI
  schemas defined separately (`src/schemas/openapi.ts`).
- Response shape is flat arrays/objects — never wrapped in `{ data: ... }`
  envelopes.
- Pagination metadata sent via response headers (`X-Total-Count`, `X-Page`,
  `X-Per-Page`).

### Ingestion (`@congress/ingestion`)

- **Finder** → discovers URLs/needles; **Retriever** → streams records from each
  URL as an Observable.
- Sinks (e.g., `persistDeputies`) are RxJS operators that consume the stream and
  write to DB.
- A **Bree** scheduler runs jobs on cron; job files use standalone scraper
  functions exported from `main.ts`.
- Browser lifecycle: one shared `Browser` instance per manual run; standalone
  job functions manage their own browser.

### Database (`@congress/database`)

- **Prisma** ORM with SQLite (local dev) / libsql (production).
- Repositories in `src/repositories/` encapsulate all DB access — never call
  `prisma` directly from outside this package.
- Validation in `src/validation/` uses Zod schemas mirroring Prisma input
  shapes.
- Re-export everything through `src/index.ts`; consumers import from
  `@congress/database`.

---

## Pre-commit Hooks

`lint-staged` runs on every commit (via Husky):

- All files: `prettier --write`
- `*.{js,mjs,cjs,ts,tsx}`: `eslint --fix --max-warnings 0`

Ensure lint and format pass before committing. CI uses `lint:ci` (zero warnings
tolerance).

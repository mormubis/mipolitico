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

## Pre-commit Hooks

`lint-staged` runs on every commit (via Husky):

- All files: `prettier --write`
- `*.{js,mjs,cjs,ts,tsx}`: `eslint --fix --max-warnings 0`

Ensure lint and format pass before committing. CI uses `lint:ci` (zero warnings
tolerance).

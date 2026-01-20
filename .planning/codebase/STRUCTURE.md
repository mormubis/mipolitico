# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
mipolitico/
├── .claude/                # Claude configuration
├── .git/                   # Git repository
├── .husky/                 # Git hooks
├── .idea/                  # IDE configuration
├── .nx/                    # Nx build cache
├── .planning/              # GSD planning documents
│   └── codebase/           # Architecture documentation
├── .playwright-mcp/        # Playwright MCP data
├── apps/                   # Application workspaces
│   └── ingestion/          # Data ingestion application
│       ├── src/            # Source code
│       ├── node_modules/   # Dependencies
│       ├── package.json    # App package configuration
│       ├── tsconfig.json   # App TypeScript config
│       └── README.md       # App documentation
├── examples/               # Sample JSON data files
│   ├── .claude/            # Example-specific Claude config
│   ├── person.json         # Sample deputy data
│   ├── vote.json           # Sample voting records
│   ├── speeches.json       # Sample parliamentary speeches
│   ├── government-bills.json
│   ├── member-bills.json
│   ├── approved-bills.json
│   ├── amendment-bills.json
│   ├── financial-disclosure.json
│   └── resignation.json
├── node_modules/           # Root dependencies
├── packages/               # (Empty - reserved for shared packages)
├── CLAUDE.md               # (Empty - Claude documentation)
├── eslint.config.mjs       # ESLint configuration
├── lint-staged.config.mjs  # Lint-staged configuration
├── main.mts                # (Root script - purpose unclear)
├── nx.json                 # Nx workspace configuration
├── package.json            # Root package configuration
├── pnpm-lock.yaml          # pnpm lockfile
├── pnpm-workspace.yaml     # pnpm workspace configuration
├── prettier.config.mjs     # Prettier configuration
└── tsconfig.json           # Root TypeScript configuration
```

## Directory Purposes

**apps/ingestion/src/**
- Purpose: Main data ingestion application source code
- Contains: Entry points, data sources, network utilities, models, detectors
- Key files: `main.ts`, `main.backup.ts`

**apps/ingestion/src/network/**
- Purpose: Network abstraction layer with rate limiting
- Contains: Browser automation, fetch wrapper, connection pool
- Key files:
  - `index.ts`: Barrel export
  - `browser.ts`: Playwright browser launcher with proxy-based rate limiting
  - `fetch.ts`: Rate-limited fetch wrapper
  - `pool.ts`: Concurrency limiter using p-limit

**apps/ingestion/src/sources/**
- Purpose: Data source implementations using Finder/Retriever pattern
- Contains: Individual scrapers for Spanish Congressional data endpoints
- Key files:
  - `types.ts`: Core type definitions (Finder, Retriever, Needle, Source)
  - `person.ts`: Active deputies data scraper
  - `bureau.ts`: Parliamentary bureau composition scraper
  - `intervention.ts`: Parliamentary speech scraper
  - `person-detail.ts`: Detailed deputy information scraper
  - `voting.ts`: Voting records scraper

**apps/ingestion/src/detectors/**
- Purpose: Change detection and delta tracking
- Contains: Services for identifying data modifications
- Key files:
  - `index.ts`: Barrel export
  - `base-detector.ts`: Abstract base class for detectors
  - `change-detection.service.ts`: Main change detection implementation

**apps/ingestion/src/models/**
- Purpose: TypeScript type definitions and interfaces
- Contains: Comprehensive data models for Congressional entities
- Key files:
  - `congressional-data.types.ts`: All entity interfaces (CongressMember, Vote, Speech, GovernmentBill, etc.)

**apps/ingestion/src/processors/**
- Purpose: Data transformation processors (stub)
- Contains: Only `types.ts` (empty file, 1 line)
- Key files: None currently implemented

**apps/ingestion/src/validators/**
- Purpose: Data validation logic (stub)
- Contains: Only `types.ts` (empty file, 1 line)
- Key files: None currently implemented (Zod schemas inline in sources)

**examples/**
- Purpose: Sample JSON data files for reference and testing
- Contains: Representative examples of each data entity type from Spanish Congress
- Key files: JSON files matching model types (person.json, vote.json, etc.)

**.planning/codebase/**
- Purpose: GSD-generated architecture documentation
- Contains: Codebase analysis documents for AI-assisted development
- Key files: ARCHITECTURE.md, STRUCTURE.md

## Key File Locations

**Entry Points:**
- `apps/ingestion/src/main.ts`: Current entry point for ingestion pipeline
- `apps/ingestion/src/main.backup.ts`: Alternative entry point (references unimplemented services)
- `main.mts`: Root-level script (purpose unclear, not currently used)

**Configuration:**
- `tsconfig.json`: Root TypeScript config (strict mode, ESNext target, no emit)
- `apps/ingestion/tsconfig.json`: Extends root config
- `eslint.config.mjs`: ESLint flat config with TypeScript support
- `prettier.config.mjs`: Prettier formatting rules
- `nx.json`: Nx build cache and target configuration
- `pnpm-workspace.yaml`: Monorepo workspace definition (apps/*, packages/*)

**Core Logic:**
- `apps/ingestion/src/sources/*.ts`: All data source implementations
- `apps/ingestion/src/network/browser.ts`: Browser automation with rate limiting
- `apps/ingestion/src/detectors/change-detection.service.ts`: Change tracking logic

**Testing:**
- No test files currently present
- `apps/ingestion/package.json` references `test` script that exits with error

## Naming Conventions

**Files:**
- Kebab-case: `change-detection.service.ts`, `base-detector.ts`, `congressional-data.types.ts`
- Lowercase single-word: `person.ts`, `bureau.ts`, `voting.ts`, `types.ts`, `utils.ts`
- Config files: Lowercase with extension prefix (`.eslintrc`, `.prettierrc`, etc.) or `.config.mjs` suffix

**Directories:**
- Lowercase plural nouns: `sources/`, `detectors/`, `models/`, `validators/`, `processors/`
- Lowercase singular: `network/`, `src/`

**Variables/Functions:**
- camelCase: `finder`, `retriever`, `random()`, `sleep()`, `romanize()`, `shuffle()`
- Constants: UPPERCASE for schema fields (`NOMBRE`, `BIOGRAFIA`, `CIRCUNSCRIPCION`)

**Types/Interfaces:**
- PascalCase: `Finder`, `Retriever`, `Needle`, `Model`, `CongressMember`, `ChangeSet`
- Suffix patterns: `Service` for classes (`ChangeDetectionService`), `Config` for configuration

## Import Organization

**Order:**
1. Node built-ins: `import { Readable } from 'node:stream';`
2. Third-party libraries: `import oboe from 'oboe';`, `import { Observable } from 'rxjs';`, `import { z } from 'zod';`
3. Internal modules: `import { fetch, launch } from './network/index.ts';`
4. Type imports (separate): `import type { Finder, Retriever } from './types';`

**Path Aliases:**
- None configured (relative paths used throughout)
- Relative imports use `.ts` extension: `import { random } from '../utils.ts';`

## Where to Add New Code

**New Data Source:**
- Primary code: `apps/ingestion/src/sources/{name}.ts`
- Export `finder`, `retriever`, `Schema`, `Model` type
- Follow existing pattern: person.ts, bureau.ts, voting.ts

**New Processing Logic:**
- Processors: `apps/ingestion/src/processors/{name}.ts`
- Validators: `apps/ingestion/src/validators/{name}.ts` (or inline Zod in sources)
- Detectors: `apps/ingestion/src/detectors/{name}-detector.ts`

**New Utilities:**
- Add function to `apps/ingestion/src/utils.ts`
- Export from same file (no barrel pattern for utils)

**New Models:**
- Add interface to `apps/ingestion/src/models/congressional-data.types.ts`
- Follow existing naming convention (match Spanish Congressional field names in UPPERCASE)

**New Application:**
- Create directory: `apps/{app-name}/`
- Add package.json with workspace reference
- Add tsconfig.json extending root config
- Add to `pnpm-workspace.yaml` (already includes `apps/*`)

**Shared Packages:**
- Create directory: `packages/{package-name}/`
- Add package.json with `@congress/{package-name}` scope
- Add to `pnpm-workspace.yaml` (already includes `packages/*`)

## Special Directories

**node_modules:**
- Purpose: Installed npm dependencies
- Generated: Yes (via pnpm install)
- Committed: No (.gitignore)

**.nx/cache:**
- Purpose: Nx build cache for faster rebuilds
- Generated: Yes (during Nx operations)
- Committed: No (.gitignore)

**.planning:**
- Purpose: GSD planning and architecture documentation
- Generated: Yes (via GSD commands)
- Committed: Not specified (should be committed for AI context)

**.playwright-mcp:**
- Purpose: Playwright MCP (Model Context Protocol) data
- Generated: Yes (during Playwright operations)
- Committed: No (appears in git status as untracked)

**.husky:**
- Purpose: Git hooks for pre-commit linting
- Generated: No (configured in repository)
- Committed: Yes

**examples:**
- Purpose: Reference data for development and testing
- Generated: No (manually curated examples)
- Committed: Yes

---

*Structure analysis: 2026-01-20*

# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- TypeScript 5.9.2 - All application code
- JavaScript (ESM) - Configuration files

**Secondary:**
- None detected

## Runtime

**Environment:**
- Node.js 25.2.1

**Package Manager:**
- pnpm 10.28.1
- Lockfile: present (`pnpm-lock.yaml`)

## Frameworks

**Core:**
- RxJS 7.8.2 - Reactive programming for data streaming
- Playwright 1.55.0 - Browser automation and web scraping

**Testing:**
- Not detected - Tests are not configured

**Build/Dev:**
- Nx 21.4.1 - Monorepo build system
- TypeScript 5.9.2 - Type checking and compilation
- ESLint 9.34.0 - Code linting
- Prettier 4.0.0-alpha.12 - Code formatting

## Key Dependencies

**Critical:**
- `playwright` 1.55.0 - Browser automation for scraping congressional data
- `rxjs` 7.8.2 - Observable streams for asynchronous data processing
- `zod` 4.0.17 - Runtime schema validation
- `oboe` 2.1.5 - JSON streaming parser for large datasets

**Infrastructure:**
- `sqlite3` 5.1.7 - Local database storage (declared but usage not detected in current code)
- `p-limit` 7.2.0 - Concurrency control for network requests
- `p-queue` 9.0.1 - Promise queue management
- `p-retry` 7.1.1 - Retry logic for failed operations
- `p-defer` 4.0.1 - Deferred promise utilities

**Code Quality:**
- `@typescript-eslint/eslint-plugin` 8.42.0 - TypeScript linting rules
- `eslint-plugin-import-x` 4.16.1 - Import/export linting
- `husky` 9.1.7 - Git hooks
- `lint-staged` 16.1.6 - Pre-commit linting

## Configuration

**Environment:**
- No environment variables detected in current code
- Configuration is hard-coded or passed as arguments

**Build:**
- `tsconfig.json` - TypeScript configuration (ESNext target, strict mode, ESM modules)
- `eslint.config.mjs` - Flat config with TypeScript, import rules, and Prettier integration
- `prettier.config.mjs` - Code formatting (single quotes, consistent quote props, prose wrap)
- `lint-staged.config.mjs` - Pre-commit hooks for formatting and linting

## Platform Requirements

**Development:**
- Node.js 25.2.1+
- pnpm 10.28.1+
- TypeScript 5.9.2+
- Playwright browsers (Chromium, Firefox, WebKit)

**Production:**
- Not detected - No deployment configuration found
- Appears to be a local data ingestion tool

---

*Stack analysis: 2026-01-20*

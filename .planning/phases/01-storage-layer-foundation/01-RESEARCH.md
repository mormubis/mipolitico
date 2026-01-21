# Phase 1: Storage Layer Foundation - Research

**Researched:** 2026-01-21 **Domain:** Prisma ORM with SQLite in
Node.js/TypeScript monorepo **Confidence:** HIGH

## Summary

Prisma ORM version 7 (released 2026) is the current standard for type-safe
database operations in TypeScript, featuring a Rust-free architecture with 3x
faster queries and 90% smaller bundles. For this Phase 1 implementation in an Nx
monorepo with pnpm workspaces:

**Key architectural decisions validated:**

1. **Prisma as standalone package** — Place schema.prisma in a shared
   `packages/database/` directory with custom output path for generated client
2. **Automatic migrations on startup** — Use `prisma migrate deploy` in
   production, which applies pending migrations but never resets data
3. **Multi-file schema support** — Prisma 6.7.0+ supports modular schema
   organization (GA since June 2025), allowing domain-based file splits
4. **Validation layer integration** — Zod validation happens before Prisma
   operations using Prisma Client Extensions or wrapper functions
5. **Transaction patterns** — Use `$transaction([])` for batch upserts (Prisma
   lacks native `upsertMany`)
6. **Testing strategy** — Use Prismock for unit tests (in-memory), real SQLite
   database for integration tests with migrations

**Primary recommendation:** Create `packages/database` as standalone package
with modular schema files by domain (persons.prisma, votes.prisma, etc.), export
Prisma Client instance, and integrate into scrapers via workspace dependencies.
Use sequential transactions for batch UPSERT operations and Zod validation
before database writes.

## Standard Stack

The established libraries/tools for Prisma-based storage layers:

### Core

| Library        | Version | Purpose                                   | Why Standard                                                                |
| -------------- | ------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| prisma         | 7.x     | ORM with type-safe queries and migrations | Industry standard for TypeScript ORMs, official tooling, active maintenance |
| @prisma/client | 7.x     | Auto-generated type-safe database client  | Generated from schema, provides full type safety across codebase            |
| zod            | 4.x     | Runtime validation and type inference     | Already in use in codebase, integrates naturally with Prisma                |
| sqlite3        | 5.1.7   | SQLite database driver                    | Already installed, embedded database, no separate server required           |

### Supporting

| Library             | Version | Purpose                                | When to Use                                            |
| ------------------- | ------- | -------------------------------------- | ------------------------------------------------------ |
| prismock            | latest  | In-memory Prisma mock for unit tests   | Unit testing database operations without real database |
| @nx-tools/nx-prisma | latest  | Nx executors and generators for Prisma | Optional: Nx-specific Prisma integration if needed     |

### Alternatives Considered

| Instead of | Could Use          | Tradeoff                                                                                                         |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Prisma     | Drizzle ORM        | User decided Prisma (CONTEXT.md decision) — Drizzle offers raw SQL flexibility but less mature migration tooling |
| prismock   | prisma-mock-vitest | Both viable, prismock has broader test framework support (Jest + Vitest)                                         |

**Installation:**

```bash
# In packages/database
pnpm add prisma @prisma/client
pnpm add -D prismock

# Initialize Prisma
npx prisma init --datasource-provider sqlite
```

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── database/                    # Standalone Prisma package
│   ├── prisma/
│   │   ├── schema/              # Modular schema files (GA since Prisma 6.7.0)
│   │   │   ├── _base.prisma   # datasource, generator config
│   │   │   ├── persons.prisma  # Person and Party models
│   │   │   ├── votes.prisma    # Voting records
│   │   │   ├── speeches.prisma # Congressional speeches
│   │   │   ├── bureaus.prisma  # Bureau membership
│   │   │   └── commissions.prisma
│   │   ├── migrations/          # Version-controlled migrations
│   │   └── seed.ts              # Seed data script
│   ├── src/
│   │   └── index.ts             # Export Prisma Client instance
│   ├── package.json
│   └── tsconfig.json
apps/
├── ingestion/                   # Scraper application
│   ├── src/
│   │   ├── sources/             # Existing scrapers
│   │   │   ├── person.ts
│   │   │   ├── voting.ts
│   │   │   └── ...
│   │   └── repositories/        # NEW: Database write operations
│   │       ├── person-repository.ts
│   │       ├── vote-repository.ts
│   │       └── ...
│   └── package.json             # Includes "database": "workspace:*"
```

### Pattern 1: Modular Schema Organization

**What:** Split Prisma schema into multiple files by domain (persons, votes,
speeches, etc.) **When to use:** Always for projects with >5 models (improves
maintainability) **Example:**

```prisma
// prisma/schema/_base.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// prisma/schema/persons.prisma
model Person {
  id              String   @id @default(cuid())
  externalId      String   @unique  // Congress ID
  firstName       String
  lastName        String
  fullName        String
  district        String
  biography       String
  entryDate       DateTime
  exitDate        DateTime?

  partyId         String
  party           Party    @relation(fields: [partyId], references: [id])

  votes           Vote[]
  speeches        Speech[]
  bureauMembers   BureauMember[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([externalId])
  @@index([lastName, firstName])
}

model Party {
  id        String   @id @default(cuid())
  name      String
  acronym   String   @unique
  persons   Person[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([acronym])
}
```

**Source:**
[Organize your Prisma Schema into multiple files](https://www.prisma.io/blog/organize-your-prisma-schema-with-multi-file-support)

### Pattern 2: Standalone Database Package in Monorepo

**What:** Create database as shared package with custom output path **When to
use:** Always in monorepos (enables sharing across apps) **Example:**

```typescript
// packages/database/src/index.ts
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
});

export { prisma };
export * from '../generated/client';

// apps/ingestion/src/repositories/person-repository.ts
import { prisma, Prisma } from 'database';

export async function upsertPersons(persons: Prisma.PersonCreateInput[]) {
  return prisma.$transaction(
    persons.map((person) =>
      prisma.person.upsert({
        where: { externalId: person.externalId },
        create: person,
        update: person,
      }),
    ),
  );
}
```

**Source:**
[How to use Prisma ORM in pnpm workspaces monorepo](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces)

### Pattern 3: Zod Validation Before Prisma Operations

**What:** Validate scraped data with Zod schemas, then write to database **When
to use:** Always for external data (prevents invalid data from reaching
database) **Example:**

```typescript
// apps/ingestion/src/repositories/vote-repository.ts
import { z } from 'zod';
import { prisma } from 'database';
import { Schema as VoteSchema } from '../sources/voting';

interface ValidationError {
  timestamp: string;
  source: string;
  record: unknown;
  error: string;
}

const validationErrors: ValidationError[] = [];

export async function upsertVotes(rawVotes: unknown[]) {
  const validVotes = [];

  for (const raw of rawVotes) {
    try {
      const validated = VoteSchema.parse(raw);
      validVotes.push(validated);
    } catch (error) {
      validationErrors.push({
        timestamp: new Date().toISOString(),
        source: 'votes',
        record: raw,
        error: error instanceof z.ZodError ? error.message : String(error),
      });
    }
  }

  // Write invalid records to JSON-lines log
  if (validationErrors.length > 0) {
    await writeValidationErrors(validationErrors);
  }

  // Batch UPSERT valid records in transaction (all-or-nothing)
  if (validVotes.length > 0) {
    return prisma.$transaction(
      validVotes.map((vote) =>
        prisma.vote.upsert({
          where: {
            legislature_session_number: {
              legislature: vote.LEGISLATURE,
              sessionNumber: vote.SESSION_NUMBER,
              votingNumber: vote.VOTING_NUMBER,
              deputySeat: vote.DEPUTY_SEAT,
            },
          },
          create: mapToVoteCreate(vote),
          update: mapToVoteCreate(vote),
        }),
      ),
    );
  }
}
```

**Source:**
[Custom validation with Prisma](https://www.prisma.io/docs/orm/prisma-client/queries/custom-validation)

### Pattern 4: Migration Execution on Startup

**What:** Run `prisma migrate deploy` automatically when app starts **When to
use:** Always in production/deployment environments **Example:**

```typescript
// apps/ingestion/src/main.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runMigrations() {
  console.log('Running database migrations...');
  try {
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      cwd: '../../packages/database',
    });
    console.log('Migrations applied successfully');
    if (stdout) console.log(stdout);
    if (stderr) console.warn(stderr);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1); // Fail-fast on migration errors
  }
}

async function main() {
  await runMigrations();

  // Start scrapers...
}

main();
```

**Source:**
[Prisma Migrate development and production workflows](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)

### Pattern 5: Sequential Transactions for Batch UPSERT

**What:** Use `$transaction([])` with mapped upsert promises **When to use:**
Whenever you need to UPSERT multiple records atomically **Example:**

```typescript
// Prisma doesn't have upsertMany, so we use transactions
const upsertPromises = validatedPersons.map((person) =>
  prisma.person.upsert({
    where: { externalId: person.externalId },
    create: person,
    update: person,
  }),
);

// All succeed or all fail (atomic)
const results = await prisma.$transaction(upsertPromises);
```

**Note:** Operations execute sequentially despite array syntax (single
connection constraint) **Source:**
[Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

### Anti-Patterns to Avoid

- **Don't use `prisma migrate dev` in production:** This command resets
  databases and generates artifacts. Use `prisma migrate deploy` only.
- **Don't keep transactions open long:** Avoid network requests or slow queries
  inside transaction functions (causes deadlocks).
- **Don't manually manage Prisma Client lifecycle:** Let Prisma Client handle
  connection pooling (don't call `$connect()` explicitly).
- **Don't use `Promise.all()` around `$transaction()`:** Operations already run
  sequentially due to single-connection constraint.
- **Don't ignore validation errors silently:** Log all validation failures to
  JSON-lines file for debugging.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                        | Don't Build                        | Use Instead                                                     | Why                                                                                   |
| ------------------------------ | ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Zod schemas from Prisma models | Manual Zod schema definitions      | `zod-prisma-types` or `prisma-zod-generator`                    | Auto-generates Zod schemas from Prisma schema, keeps validation in sync with database |
| Connection pooling             | Custom connection management       | Prisma's built-in pooling                                       | Prisma Client automatically manages connection pools with sensible defaults           |
| Migration rollback             | Custom rollback scripts            | `prisma migrate diff` + `db execute` + `migrate resolve`        | Official tooling for generating and applying down migrations                          |
| Test database isolation        | Manual database cleanup            | prismock (unit tests) or Docker + migration reset (integration) | Prismock provides in-memory database, Docker ensures isolated test environments       |
| Idempotent writes              | Manual "check if exists" logic     | Prisma's `upsert()` with unique constraints                     | Upsert is atomic and handles race conditions at database level                        |
| Batch operations               | Manual loops with individual saves | `$transaction([])` with mapped operations                       | Ensures atomicity (all-or-nothing) and better error handling                          |

**Key insight:** Prisma has evolved over 7 major versions to handle edge cases
you won't anticipate. Use official patterns rather than custom implementations,
especially for migrations, transactions, and connection management.

## Common Pitfalls

### Pitfall 1: SQLite Type System Weakness

**What goes wrong:** SQLite doesn't enforce type constraints as strictly as
PostgreSQL/MySQL. Enum values have no database-level validation, and oversized
integers can be stored directly. **Why it happens:** SQLite uses "loose typing"
with type affinity rather than strict types. Boolean is stored as 0/1, enums as
strings without validation. **How to avoid:**

- Always validate with Zod before database writes
- Use Prisma's type validation on reads (throws P2023 for oversized integers in
  Prisma 4.0+)
- Document enum constraints in schema comments for developer awareness **Warning
  signs:** Runtime errors when querying data that passed database insert
  **Source:**
  [SQLite database connector](https://www.prisma.io/docs/orm/overview/databases/sqlite)

### Pitfall 2: Migration Rollback Expectations

**What goes wrong:** Developers expect easy rollbacks like other migration
tools, but Prisma's philosophy is "fix forward" rather than "roll back." **Why
it happens:** Rollbacks can cause data loss in production once live code
populates new structures. Prisma prioritizes data safety over convenient
rollbacks. **How to avoid:**

- Test migrations thoroughly in staging before production
- Use expand-and-contract pattern for breaking changes (deploy schema changes
  separately from code changes)
- Generate down migrations with `prisma migrate diff` only for emergency
  recovery
- Plan for forward-fixing migrations rather than rollbacks **Warning signs:**
  Trying to "undo" a production migration **Source:**
  [Generating down migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations)

### Pitfall 3: No Native `upsertMany` Operation

**What goes wrong:** Developers assume Prisma has `upsertMany` like
`createMany`, leading to inefficient manual loops or incorrect implementations.
**Why it happens:** Prisma's API doesn't include bulk upsert despite having bulk
create/update/delete. **How to avoid:**

- Use `$transaction([])` with mapped `upsert()` calls for atomic batch upserts
- Limit batch sizes to avoid long-running transactions (<1000 records per batch
  recommended)
- Consider read-delete-recreate pattern with `createMany` for very large
  datasets (faster but requires transaction) **Warning signs:** Manual loops
  calling `upsert()` without transaction wrapper **Source:**
  [Help with bulk upsert](https://github.com/prisma/prisma/discussions/22688)

### Pitfall 4: Automatic Seeding Removed in Prisma 7

**What goes wrong:** Developers expect `prisma migrate dev` or
`prisma migrate reset` to automatically seed the database (worked in Prisma
5-6). **Why it happens:** Prisma 7 changed seeding to explicit-only execution to
give developers more control. **How to avoid:**

- Run `npx prisma db seed` explicitly after migrations
- Add seed command to package.json scripts or CI/CD pipeline
- Document seeding requirements for new developers **Warning signs:** Empty
  database after running migrations in fresh environment **Source:**
  [Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)

### Pitfall 5: Connection Pooling Misconfiguration

**What goes wrong:** Developers set high connection limits for SQLite like they
would for PostgreSQL, causing unexpected behavior. **Why it happens:** SQLite is
file-based, not networked. Default Prisma connection pooling is optimized for
network databases (10 connections in Prisma 7). **How to avoid:**

- SQLite doesn't need large connection pools (single-writer architecture)
- Use Prisma's defaults for SQLite (documentation doesn't specify SQLite pool
  configuration)
- If using driver adapters, check adapter's pooling behavior **Warning signs:**
  Lock errors or "database is locked" messages under high concurrency
  **Source:**
  [Connection pool](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)

### Pitfall 6: Test Database Isolation

**What goes wrong:** Integration tests run in parallel and interfere with each
other, causing flaky test failures. **Why it happens:** Multiple test threads
access the same database file simultaneously. **How to avoid:**

- Configure test runner with `threads: false` or `maxWorkers: 1` for integration
  tests
- Use separate Vitest/Jest configs for unit tests (parallel with prismock) vs.
  integration tests (sequential with real DB)
- Reset database state in `beforeEach` hooks using `deleteMany` in transactions
  **Warning signs:** Tests pass individually but fail when run together
  **Source:**
  [The Ultimate Guide to Testing with Prisma: Integration Testing](https://www.prisma.io/blog/testing-series-3-aBUyF8nxAn)

## Code Examples

Verified patterns from official sources:

### Example 1: Package.json Scripts for Monorepo

```json
// packages/database/package.json
{
  "name": "database",
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio",
    "db:format": "prisma format"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}

// Root package.json
{
  "scripts": {
    "build": "pnpm --filter database db:deploy && pnpm --filter database db:generate && pnpm --filter ingestion build",
    "dev": "pnpm --filter database db:generate && pnpm --filter ingestion dev"
  }
}
```

**Source:**
[Using Prisma with pnpm workspaces](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces)

### Example 2: Transaction with Validation

```typescript
import { prisma } from 'database';
import { Observable } from 'rxjs';
import { z } from 'zod';

async function writeToDatabase<T extends z.ZodSchema>(
  records$: Observable<unknown>,
  schema: T,
  upsertFn: (validated: z.infer<T>) => Promise<void>,
) {
  const validRecords: z.infer<T>[] = [];
  const errors: ValidationError[] = [];

  // Collect and validate all records from Observable
  await new Promise((resolve, reject) => {
    records$.subscribe({
      next: (record) => {
        try {
          validRecords.push(schema.parse(record));
        } catch (error) {
          errors.push({
            timestamp: new Date().toISOString(),
            source: schema._def.typeName,
            record,
            error: error instanceof z.ZodError ? error.message : String(error),
          });
        }
      },
      complete: resolve,
      error: reject,
    });
  });

  // Log validation errors
  if (errors.length > 0) {
    await writeValidationErrorsLog(errors);
    console.warn(`${errors.length} records failed validation`);
  }

  // Batch upsert in transaction (all-or-nothing)
  if (validRecords.length > 0) {
    try {
      await prisma.$transaction(validRecords.map((record) => upsertFn(record)));
      console.log(`Successfully upserted ${validRecords.length} records`);
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error; // Scraper will retry (Phase 3)
    }
  }
}
```

### Example 3: Integration Test Setup

```typescript
// tests/integration/setup.ts
import { prisma } from 'database';

export async function resetDatabase() {
  // Delete all data in correct order (respecting foreign keys)
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.speech.deleteMany(),
    prisma.bureauMember.deleteMany(),
    prisma.person.deleteMany(),
    prisma.party.deleteMany(),
  ]);
}

// tests/integration/votes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from './setup';
import { upsertVotes } from '../../src/repositories/vote-repository';

describe('Vote Repository Integration Tests', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('should upsert votes atomically', async () => {
    const testVotes = [
      /* test data */
    ];
    await upsertVotes(testVotes);

    const votes = await prisma.vote.findMany();
    expect(votes).toHaveLength(testVotes.length);
  });

  it('should skip invalid votes but insert valid ones', async () => {
    const mixedVotes = [
      {
        /* valid vote */
      },
      {
        /* invalid vote - missing required field */
      },
      {
        /* valid vote */
      },
    ];

    await upsertVotes(mixedVotes);

    const votes = await prisma.vote.findMany();
    expect(votes).toHaveLength(2); // Only valid votes inserted
  });
});

// vitest.integration.config.ts
export default {
  test: {
    threads: false, // CRITICAL: Sequential execution for database tests
    include: ['tests/integration/**/*.test.ts'],
  },
};
```

**Source:**
[The Ultimate Guide to Testing with Prisma: Integration Testing](https://www.prisma.io/blog/testing-series-3-aBUyF8nxAn)

## State of the Art

| Old Approach                         | Current Approach                           | When Changed              | Impact                                                |
| ------------------------------------ | ------------------------------------------ | ------------------------- | ----------------------------------------------------- |
| Single schema.prisma file            | Multi-file schema with domain organization | Prisma 6.7.0 (June 2025)  | Better maintainability for large projects, GA feature |
| Automatic seeding on migration       | Explicit `npx prisma db seed` only         | Prisma 7.0 (early 2026)   | More control, requires manual/CI integration          |
| Rust-based query engine              | Rust-free architecture                     | Prisma 7.0 (January 2026) | 3x faster queries, 90% smaller bundles                |
| CPU-based connection pool default    | Fixed default of 10 connections            | Prisma 7.0                | Predictable behavior across environments              |
| Formula: `num_physical_cpus * 2 + 1` | Default: 10 connections                    | Prisma 7.0                | Simpler configuration                                 |

**Deprecated/outdated:**

- `zod-prisma-types`: In limited maintenance mode as of 2025, maintainer
  recommends `prisma-zod-generator` for new projects
- Prisma 5-6 seeding behavior: No longer automatic, must be explicit in Prisma 7
- CPU-based connection pool sizing: Removed in Prisma 7, now fixed at 10 by
  default

**Source:**
[Prisma 7: Rust-Free Architecture and Performance Gains](https://www.infoq.com/news/2026/01/prisma-7-performance/)

## Open Questions

Things that couldn't be fully resolved:

1. **SQLite connection pooling configuration specifics**

   - What we know: Prisma 7 defaults to 10 connections for network databases,
     SQLite is file-based
   - What's unclear: Official SQLite-specific connection pool configuration
     (docs focus on PostgreSQL/MySQL/SQL Server)
   - Recommendation: Use Prisma defaults, monitor for "database is locked"
     errors, adjust only if issues arise

2. **Optimal batch size for transaction UPSERT operations**

   - What we know: Large batches can cause long-running transactions (bad for
     database performance)
   - What's unclear: Specific threshold for SQLite (varies by record size, disk
     speed, concurrency)
   - Recommendation: Start with 500-1000 records per batch, measure and adjust
     based on performance

3. **Prisma in Nx monorepo: Native Nx executors vs. package.json scripts**
   - What we know: Both `@nx-tools/nx-prisma` and simple pnpm scripts work
   - What's unclear: Performance or DX benefits of Nx-specific executors for
     this use case
   - Recommendation: Start with simple pnpm scripts (less complexity), add Nx
     executors if caching benefits are needed

## Sources

### Primary (HIGH confidence)

- [Prisma Migrate: Development and Production workflows](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production) -
  Migration strategy
- [Prisma Connection Pool documentation](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool) -
  Connection management
- [SQLite database connector](https://www.prisma.io/docs/orm/overview/databases/sqlite) -
  SQLite-specific considerations
- [Custom validation with Prisma](https://www.prisma.io/docs/orm/prisma-client/queries/custom-validation) -
  Zod integration patterns
- [Using Prisma in pnpm workspaces monorepo](https://www.prisma.io/docs/guides/use-prisma-in-pnpm-workspaces) -
  Monorepo structure
- [Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) -
  Transaction patterns
- [The Ultimate Guide to Testing with Prisma: Integration Testing](https://www.prisma.io/blog/testing-series-3-aBUyF8nxAn) -
  Testing strategy
- [Seeding](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) -
  Seed data management
- [Generating down migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations) -
  Rollback strategy
- [Organize your Prisma Schema into multiple files](https://www.prisma.io/blog/organize-your-prisma-schema-with-multi-file-support) -
  Multi-file schemas

### Secondary (MEDIUM confidence)

- [Prisma 7: Rust-Free Architecture and Performance Gains - InfoQ](https://www.infoq.com/news/2026/01/prisma-7-performance/) -
  Prisma 7 features verified with official source
- [Help with bulk upsert - GitHub Discussion](https://github.com/prisma/prisma/discussions/22688) -
  Community pattern for batch upserts
- [Improving query performance with database indexes using Prisma](https://www.prisma.io/blog/improving-query-performance-using-indexes-1-zuLNZwBkuL) -
  Index strategy
- [How to migrate data using expand and contract pattern](https://www.prisma.io/docs/guides/data-migration) -
  Migration patterns

### Tertiary (LOW confidence)

- [Super easy guide to Nx monorepo with Prisma](https://www.devcolumn.com/articles/view/super-easy-guide-on-setting-up-a-monorepo-with-postgres-prisma-and-nest-js-using-nx) -
  Community tutorial for Nx setup, marked for validation
- [Deploying Fastify with Prisma and Nx on Render.com](https://medium.com/@simone.m.999/deploying-a-fastify-application-with-prisma-and-nx-monorepo-on-render-com-20f20eb262d1) -
  Package.json script patterns

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Official Prisma documentation and established ecosystem
- Architecture patterns: HIGH - Official Prisma docs and guides, verified with
  official sources
- Pitfalls: HIGH - Official documentation and GitHub discussions on known
  limitations
- SQLite pooling specifics: MEDIUM - Docs don't cover SQLite pooling
  configuration explicitly
- Batch size optimization: MEDIUM - General guidance available, specific
  thresholds require testing

**Research date:** 2026-01-21 **Valid until:** 2026-02-21 (30 days - Prisma is
stable with predictable release cycle)

## Recommended Approach for Phase 1

Based on this research, the planner should focus on:

1. **Create `packages/database` package structure:**

   - Initialize Prisma with SQLite datasource
   - Create modular schema files in `prisma/schema/` directory by domain
   - Configure custom output path: `output = "../generated/client"`
   - Export Prisma Client instance from `src/index.ts`

2. **Define database schema with proper indexes:**

   - Persons table with unique `externalId` and indexes on `[externalId]`,
     `[lastName, firstName]`
   - Parties table with unique `acronym` and index
   - Source-specific tables (votes, speeches, bureaus, commissions) with
     composite unique constraints
   - Foreign key relationships from source tables to persons
   - All tables with `createdAt` and `updatedAt` timestamps

3. **Create repository pattern for each data source:**

   - Repository functions that accept Observable streams from scrapers
   - Zod validation before database writes, logging failures to JSON-lines file
   - Batch UPSERT operations using `$transaction([])` with mapped upsert calls
   - Proper error handling (log and re-throw for Phase 3 retry logic)

4. **Integrate migrations into startup:**

   - Add `prisma migrate deploy` call in `apps/ingestion/src/main.ts`
   - Fail-fast on migration errors (exit with non-zero code)
   - Log migration output for debugging

5. **Set up testing infrastructure:**

   - Unit tests: Use prismock for fast in-memory database operations
   - Integration tests: Use real SQLite database with `beforeEach` reset
   - Configure Vitest with `threads: false` for integration tests
   - Create seed data scripts for development and testing

6. **Modify existing scrapers minimally:**
   - Keep finder/retriever pattern unchanged (RxJS Observables)
   - Add repository layer that subscribes to retriever Observables
   - Repository handles validation, transformation, and database writes
   - Scrapers don't need to know about database implementation

---

_Researched: 2026-01-21_

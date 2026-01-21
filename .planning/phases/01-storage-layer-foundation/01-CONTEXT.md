# Phase 1: Storage Layer Foundation - Context

**Gathered:** 2026-01-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the SQLite database layer that persists all Congressional data from scrapers (deputies, votes, speeches, bureaus, and commissions) with idempotent UPSERT operations and Zod validation. The storage layer is the foundation that Phase 2 (HTTP API) and Phase 3 (Job Scheduling) depend on.

</domain>

<decisions>
## Implementation Decisions

### Schema Design

**Database Structure:**
- Normalized relational schema with shared entities and source-specific tables
- **Core entities:**
  - `persons` table — Deputy information (id, name, biographical data)
  - `parties` table — Political party entity (id, name, acronym)
  - `persons` references `parties` (foreign key)
- **Source-specific tables:**
  - `deputies` — Deputy profile completeness, status, district info (references persons)
  - `votes` — Individual voting records (references persons, sessions)
  - `speeches` — Congressional speeches/interventions (references persons, sessions)
  - `bureaus` — Bureau member roles (references persons)
  - `commissions` — Commission metadata and membership (references persons)

**Rationale:** Normalizing avoids deputy data duplication across sources. Foreign keys maintain referential integrity. Source-specific tables keep data organized by origin.

### Data Access & ORM

**Technology:** Prisma ORM (not Drizzle)
- Type-safe queries with auto-generated types
- Schema defined in `prisma/schema.prisma`
- Prisma client for all database operations

**Code Organization:**
- Modular schema by domain: `prisma/schema/persons.ts`, `prisma/schema/votes.ts`, `prisma/schema/speeches.ts`, etc.
- Query execution directly in scraper and API code using Prisma client
- No repository pattern layer — Prisma is the abstraction

**Rationale:** Prisma provides strong type safety and migrations support. Modular schema keeps code organized. Direct Prisma queries are simple and don't need an extra repository layer.

### Migration Strategy

**Migration Management:**
- Prisma migrations (built-in, using `prisma migrate`)
- All migrations stored in version control: `prisma/migrations/`
- Migrations run automatically on app startup before any code executes
- Fail-fast: If a migration fails, the app exits with an error. No silent failures.

**Deployment Flow:**
1. Developer makes schema changes in `prisma/schema.prisma`
2. Run `prisma migrate dev` locally to generate migration and test
3. Commit migration files to git
4. On deployment, app runs pending migrations automatically
5. If migration fails, app exits; deployment must be rolled back and fixed

**Rationale:** Automatic migrations on startup keep deployments simple. Fail-fast prevents silent schema mismatches. Version-controlled migrations enable rollback and auditing.

### Validation & Error Handling

**Zod Validation on Scraping:**
- Each scraper validates records with Zod before database insert
- **On validation failure:** Skip invalid records, log to file
- **Logging invalid records:** JSON-lines format in `logs/validation-errors.log`
  - Each line: `{ timestamp, source, record, error, reason }`
  - Example: `{ "timestamp": "2026-01-21T10:30:00Z", "source": "votes", "record": { ... }, "error": "missing legislatureId" }`
  - Not stored in database — log file only

**UPSERT Error Handling:**
- Database writes are transactional: all-or-nothing per batch
- If a database UPSERT fails, entire batch is rolled back
- Scraper logs the failure and retries (Phase 3 handles retry logic)

**API Query Errors:**
- Database query failures return HTTP 500 with generic message
- Log the error with full context (query, parameters, error message)
- Return request ID to user: `{ "error": "Internal server error", "request_id": "req_abc123" }`
- User/support can query logs with request ID for debugging

**Rationale:** Lenient validation (skip bad records) allows scrapers to continue. Strict transactions ensure database consistency. Request ID debugging bridges API errors to logs without exposing database details.

### Claude's Discretion

- Specific columns in each table (beyond the core person/party/source fields)
- Indexing strategy on large tables (researcher will analyze query patterns)
- Connection pooling configuration
- Backup/recovery strategy

</decisions>

<specifics>
## Specific Ideas

- Schema should be obvious when querying: "What columns do I need for votes?" → Look at votes table schema
- UPSERT operations should be automatic: Scraper doesn't check "does this already exist?" — Prisma handles it
- Invalid records during scraping should not block the entire run — if 99 out of 100 records are valid, we want to insert the 99
- Migration failures should be visible and clear (not hidden in logs)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

**Notes:**
- API error handling is Phase 2 (HTTP layer concerns)
- Retry strategies for failed scrapers are Phase 3 (Job Scheduling)
- Monitoring and alerting on validation failures is Phase 5 (Production Readiness)

</deferred>

---

*Phase: 01-storage-layer-foundation*
*Context gathered: 2026-01-21*

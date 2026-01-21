---
phase: 02-http-api-foundation
plan: 02
subsystem: database
tags: [prisma, typescript, pagination, filtering, query-functions]

# Dependency graph
requires:
  - phase: 01-storage-layer-foundation
    provides:
      Prisma schema with Deputy, VotingSession, Speech, BureauMember models
provides:
  - Query functions with filtering, pagination, and sorting for all entities
  - Reusable pagination and filtering type system
  - Exported query API from @congress/database package
affects: [02-03-rest-endpoints, 02-04-caching-layer, api-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [pagination-with-defaults, filter-builder-pattern, typed-query-results]

key-files:
  created:
    - packages/database/src/queries/index.ts
    - packages/database/src/queries/deputies.ts
    - packages/database/src/queries/votes.ts
    - packages/database/src/queries/speeches.ts
    - packages/database/src/queries/bureaus.ts
  modified:
    - packages/database/src/index.ts

key-decisions:
  - 'Use nullish coalescing (??) instead of logical OR (||) for default values
    to comply with linting rules'
  - 'Default pagination limit of 20 with max 100 to prevent resource exhaustion'
  - 'Default sort order is entity-specific (deputies by id, votes/speeches by
    date desc, bureaus by startDate desc)'
  - 'Include related entities in specific queries (VotingSession includes votes
    array)'

patterns-established:
  - 'Pagination pattern: PaginationInput with limit/offset, PaginatedResult
    wrapper with total count'
  - 'Filter pattern: Entity-specific filter interfaces (DeputyFilters,
    VoteFilters, etc.)'
  - 'Query function signature: (filters, pagination, sort) =>
    Promise<PaginatedResult<T>>'
  - 'Type exports: Export specific types (DeputyWithPerson,
    VotingSessionWithVotes) for query results'

# Metrics
duration: 3min
completed: 2026-01-21
---

# Phase 02-02: Database Query Functions with Filtering/Pagination Summary

**Query functions for all entities with filtering, pagination (limit 20, max
100), and sorting exported from @congress/database package**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-21T23:35:02Z
- **Completed:** 2026-01-21T23:38:27Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created reusable pagination and filtering type system for all queries
- Implemented query functions for deputies, voting sessions, speeches, and
  bureau members
- Added filtering support for all entity-specific attributes (legislature,
  dates, names, etc.)
- Exported all query functions from @congress/database package for API
  consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pagination and filtering types** - `114c8fe` (feat)
2. **Task 2: Implement deputy query functions** - `3a77488` (feat)
3. **Task 3: Implement vote, speech, and bureau query functions** - `1202877`
   (feat)

## Files Created/Modified

**Created:**

- `packages/database/src/queries/index.ts` - Pagination and filtering types,
  re-exports all query functions
- `packages/database/src/queries/deputies.ts` - findDeputies and findDeputyById
  with filtering by legislature, constituency, parliamentaryGroup, name
- `packages/database/src/queries/votes.ts` - findVotingSessions and
  findVotingSession with filtering by legislature, sessionNumber,
  dateFrom/dateTo
- `packages/database/src/queries/speeches.ts` - findSpeeches and findSpeechById
  with filtering by personId, speakerName, dateFrom/dateTo
- `packages/database/src/queries/bureaus.ts` - findBureauMembers and
  findBureauMemberById with filtering by organ, position, name

**Modified:**

- `packages/database/src/index.ts` - Added queries export

## Decisions Made

**1. Default pagination limits**

- Default limit: 20 results
- Maximum limit: 100 results
- Rationale: Prevent resource exhaustion while providing reasonable defaults

**2. Nullish coalescing operator**

- Use `??` instead of `||` for default values
- Rationale: Linter requirement, also safer (handles 0 and false correctly)

**3. Entity-specific default sort orders**

- Deputies: Sort by id ascending (stable order)
- Voting sessions: Sort by votingDate descending (most recent first)
- Speeches: Sort by sessionDate descending (most recent first)
- Bureau members: Sort by startDate descending (most recent first)
- Rationale: Different entities have different natural orderings

**4. Include related entities in result types**

- DeputyWithPerson includes full Person object
- VotingSessionWithVotes includes full votes array
- Rationale: Reduce need for separate queries in common cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Linting errors for unresolved imports**

- **Issue:** When creating queries/index.ts with re-exports, linting failed
  because the entity-specific files didn't exist yet
- **Resolution:** Initially created queries/index.ts without re-exports, then
  added them in Task 3 after all files existed
- **Impact:** No impact on functionality, just required slightly different
  commit order

**TypeScript .ts extension warnings**

- **Issue:** Standalone tsc check complained about .ts extensions in imports
- **Resolution:** This is expected behavior - the project uses .ts extensions
  (modern pattern for ESM), and the runtime loader handles it correctly
- **Verification:** Verified all exports are available via node import test

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next plan (02-03-REST-endpoints):**

- All query functions exported and available for API routes
- Filtering, pagination, and sorting support implemented
- Type system complete with PaginatedResult wrapper

**Note:**

- Pre-existing TypeScript errors in packages/database/src/client.ts and
  repositories/ (from Phase 1) still present
- These do not affect query functions, which compile and export correctly
- Should be addressed as tech debt cleanup

---

_Phase: 02-http-api-foundation_ _Completed: 2026-01-21_

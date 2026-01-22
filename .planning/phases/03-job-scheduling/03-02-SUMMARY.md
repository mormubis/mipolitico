---
phase: 03-job-scheduling
plan: 02
subsystem: scheduling
tags: [job-isolation, cron, try-catch, error-handling, bree-workers]

# Dependency graph
requires:
  - phase: 03-01
    provides: Bree scheduler infrastructure with job registry
provides:
  - Independent job files for deputies and voting scrapers with try-catch
    isolation
  - Standalone scraper functions (runPersonStandalone, runVotingStandalone) with
    browser lifecycle
  - Cron expressions configured (2:00 AM and 3:00 AM UTC) for staggered
    execution
  - Job error handling that logs failures without crashing scheduler
affects: [03-03, 04-data-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      Job isolation pattern,
      Standalone scraper functions,
      Try-catch error boundaries,
      Staggered cron schedules,
    ]

key-files:
  created:
    - apps/ingestion/src/jobs/deputies.ts
    - apps/ingestion/src/jobs/voting.ts
  modified:
    - apps/ingestion/src/main.ts
    - apps/ingestion/src/jobs/index.ts

key-decisions:
  - 'Standalone scraper functions with independent browser lifecycle for job
    isolation'
  - 'Try-catch wrappers in job files prevent cascade failures between scrapers'
  - 'Staggered 1-hour cron offset (2 AM vs 3 AM) prevents concurrent database
    writes'
  - 'Job result objects include success/error/executedAt for observability'

patterns-established:
  - 'Job export pattern: Default async function returning {success,
    result/error, executedAt}'
  - 'Error logging: Errors logged to stderr, not thrown, allowing scheduler to
    continue'
  - 'Resource cleanup: try-finally ensures browser and database cleanup
    regardless of errors'

# Metrics
duration: 3min
completed: 2026-01-22
---

# Phase 3 Plan 2: Per-Source Job Isolation with Independent Scheduling Summary

**Independent job files for deputies and voting scrapers with try-catch
isolation, standalone browser lifecycle, and staggered cron schedules preventing
cascade failures**

## Performance

- **Duration:** 3 minutes
- **Started:** 2026-01-22T20:39:12Z
- **Completed:** 2026-01-22T20:42:33Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created deputies.ts and voting.ts job files with Bree-compatible default
  exports
- Refactored main.ts to export runPersonStandalone() and runVotingStandalone()
  with independent browser lifecycle
- Updated job registry with cron expressions (0 2 \* \* _ and 0 3 _ \* \*) and
  enabled both jobs
- Implemented try-catch isolation ensuring one job's failure doesn't affect
  other jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create deputies job with try-catch isolation and cron schedule** -
   `22a3a74` (feat)
2. **Task 2: Create voting job with try-catch isolation and cron schedule** -
   `55a9770` (feat)
3. **Task 3: Update job registry with cron expressions and enable jobs** -
   `8c8a380` (feat)

## Files Created/Modified

- `apps/ingestion/src/jobs/deputies.ts` - Deputies scraper job with try-catch
  wrapper and result object return
- `apps/ingestion/src/jobs/voting.ts` - Voting scraper job with try-catch
  wrapper and result object return
- `apps/ingestion/src/main.ts` - Added runPersonStandalone() and
  runVotingStandalone() exports with browser lifecycle
- `apps/ingestion/src/jobs/index.ts` - Added cron field to JobMetadata, enabled
  both jobs with staggered schedules

## Decisions Made

**1. Standalone scraper functions with browser lifecycle**

- **Rationale:** Existing runPerson() and runVoting() depend on module-level
  browser variable only initialized in manual scrape mode. Standalone versions
  enable job file imports with complete lifecycle management.

**2. Try-catch wrappers in job files**

- **Rationale:** Catch and log errors instead of throwing to prevent one job's
  failure from affecting scheduler or other jobs. Returns error in result object
  for observability.

**3. Staggered cron schedules (1-hour offset)**

- **Rationale:** Deputies at 2:00 AM UTC, voting at 3:00 AM UTC prevents
  concurrent database writes and SQLite contention (MAX_CONCURRENT_JOBS=1
  provides additional safety).

**4. Job result objects with executedAt timestamp**

- **Rationale:** Structured return value {success, result/error, executedAt}
  provides observability and enables future monitoring/alerting features.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created standalone scraper functions for job
isolation**

- **Found during:** Task 1 (Creating deputies job file)
- **Issue:** Existing runPerson() and runVoting() functions depend on
  module-level `browser` variable which is only initialized when running manual
  scrapes (`--no-scheduler` or `--source`). Job files need independent browser
  lifecycle.
- **Fix:** Created runPersonStandalone() and runVotingStandalone() in main.ts
  that initialize their own browser instances, perform scraping, and clean up.
  Exported these functions for job file imports.
- **Files modified:** apps/ingestion/src/main.ts
- **Verification:** TypeScript compiles, ESLint passes, functions can be
  imported and called independently
- **Committed in:** 22a3a74 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking) **Impact on plan:** Essential
refactoring to enable job isolation. Maintains backwards compatibility with
existing manual scrape workflow while enabling scheduler mode. No scope creep.

## Issues Encountered

None - deviation handled automatically via Rule 3.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both jobs implemented and enabled in registry
- Staggered cron schedules prevent database contention
- Error isolation ensures independent job execution
- Ready for Plan 03-03 (monitoring and health checks) or Phase 4 (data
  expansion)

**Blockers:** None

**Notes for next plan:**

- Jobs are scheduled but scheduler won't run them until next scheduled time (2
  AM / 3 AM UTC)
- To test jobs immediately, use:
  `node --input-type=module --eval "import('./src/jobs/deputies.ts').then(m => m.default())"`
- Job error logs appear in stderr with timestamp for debugging
- Each job manages its own browser lifecycle and database cleanup

---

_Phase: 03-job-scheduling_ _Completed: 2026-01-22_

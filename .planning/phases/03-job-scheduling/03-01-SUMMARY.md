---
phase: 03-job-scheduling
plan: 01
subsystem: scheduling
tags: [bree, job-scheduler, worker-threads, cron, tsx]

# Dependency graph
requires:
  - phase: 02-http-api-foundation
    provides: Complete API layer with endpoints and database access
provides:
  - Bree scheduler instance configured with worker thread support
  - Job registry system for managing scheduled scrapers
  - Conditional startup logic supporting both scheduler and manual modes
  - Graceful shutdown handlers for clean job termination
affects: [03-02, 04-data-expansion]

# Tech tracking
tech-stack:
  added: [bree@9.2.8, tsx@4.21.0]
  patterns:
    [Job registry pattern, Worker thread isolation, Conditional app modes]

key-files:
  created:
    - apps/ingestion/src/scheduler.ts
    - apps/ingestion/src/jobs/index.ts
  modified:
    - apps/ingestion/src/main.ts
    - apps/ingestion/package.json
    - package.json

key-decisions:
  - 'Use Bree for job scheduling with worker thread isolation'
  - 'Job metadata managed in central registry (jobs/index.ts)'
  - 'Conditional startup: scheduler mode by default, manual scrape mode with
    --source or --no-scheduler'
  - 'MAX_CONCURRENT_JOBS set to 1 to avoid SQLite write contention'
  - 'Install tsx at workspace root for TypeScript execution'

patterns-established:
  - 'Job registration pattern: Registry array with metadata (name, path,
    enabled)'
  - 'Graceful shutdown: SIGTERM/SIGINT handlers stop scheduler cleanly'
  - 'Browser initialization: Conditional based on execution mode (scheduler vs
    manual)'

# Metrics
duration: 5.7min
completed: 2026-01-22
---

# Phase 3 Plan 1: Bree Scheduler Setup Summary

**Bree job scheduler with worker thread isolation, job registry pattern, and
conditional startup modes for automated and manual scraper execution**

## Performance

- **Duration:** 5.7 minutes
- **Started:** 2026-01-22T20:31:36Z
- **Completed:** 2026-01-22T20:37:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Bree scheduler instance configured with worker threads and graceful shutdown
- Job registry system with metadata for deputies and voting jobs (disabled
  initially)
- Conditional startup supporting scheduler mode (default) and manual scrape mode
  (--no-scheduler or --source)
- TypeScript execution environment with tsx installed at workspace root

## Task Commits

Each task was committed atomically:

1. **Task 1: Install bree and configure scheduler instance** - `364573e` (chore)
2. **Task 2: Create job registry and integrate scheduler with main.ts** -
   `d63ba50` (feat)

## Files Created/Modified

- `apps/ingestion/src/scheduler.ts` - Bree instance with worker thread config
  and shutdown handlers
- `apps/ingestion/src/jobs/index.ts` - Job registry with metadata and
  MAX_CONCURRENT_JOBS constant
- `apps/ingestion/src/main.ts` - Conditional startup logic and mode selection
- `apps/ingestion/package.json` - Added bree@9.2.8 dependency
- `package.json` - Added tsx@4.21.0 dev dependency at workspace root

## Decisions Made

**1. Bree for job scheduling**

- **Rationale:** Worker thread isolation prevents scraper failures from crashing
  main process, built-in cron support, TypeScript compatible

**2. Job registry pattern in jobs/index.ts**

- **Rationale:** Central metadata management allows enabling/disabling jobs
  without modifying scheduler code, supports future job additions

**3. Conditional startup modes**

- **Rationale:** Maintains backwards compatibility with existing manual scrape
  workflow while enabling new scheduler-first behavior

**4. MAX_CONCURRENT_JOBS = 1**

- **Rationale:** SQLite database doesn't handle concurrent writes well,
  sequential job execution prevents contention

**5. tsx at workspace root**

- **Rationale:** Enables TypeScript execution across all workspace packages,
  required for running scheduler in development

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Incorrect Bree package name in plan**

- **Found during:** Task 1 (Installing @breejs/bree)
- **Issue:** Plan specified `@breejs/bree` but correct npm package is `bree`
- **Fix:** Installed `bree` instead of `@breejs/bree`
- **Files modified:** apps/ingestion/package.json, pnpm-lock.yaml
- **Verification:** `pnpm ls bree` shows package installed correctly
- **Committed in:** 364573e (Task 1 commit)

**2. [Rule 3 - Blocking] Missing tsx dependency**

- **Found during:** Task 2 (Testing scheduler startup)
- **Issue:** tsx command not found when running `pnpm run scrape`, TypeScript
  files couldn't execute
- **Fix:** Installed tsx@4.21.0 at workspace root with `pnpm add -Dw tsx`
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm exec tsx` command works, scheduler starts successfully
- **Committed in:** d63ba50 (Task 2 commit)

**3. [Rule 1 - Bug] Bree start() called with no jobs**

- **Found during:** Task 2 (Testing scheduler startup)
- **Issue:** Bree's start() method requires job files to exist, crashes when
  jobs array is empty
- **Fix:** Modified startScheduler() to skip start() call and exit cleanly when
  no enabled jobs
- **Files modified:** apps/ingestion/src/main.ts
- **Verification:** Scheduler startup prints "Scheduler ready but not started
  (no jobs)" and exits cleanly
- **Committed in:** d63ba50 (Task 2 commit)

**4. [Rule 1 - Bug] ESLint errors for template literals and floating promise**

- **Found during:** Task 2 (Git commit hooks)
- **Issue:** TypeScript numbers in template literals require String()
  conversion, main() call needs void operator
- **Fix:** Added String() wrappers for all number template expressions, changed
  `main()` to `void main()`
- **Files modified:** apps/ingestion/src/main.ts
- **Verification:** ESLint passes with --max-warnings 0
- **Committed in:** d63ba50 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking) **Impact on plan:** All
auto-fixes necessary for correctness and execution. No scope creep.

## Issues Encountered

None - all issues were resolved via deviation rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Scheduler infrastructure complete and tested
- Ready for Plan 03-02 to create actual job files (deputies.ts and voting.ts)
- Job registry has placeholder entries ready to be enabled
- Graceful shutdown working correctly

**Blockers:** None

**Notes for next plan:**

- Job files need to export default async functions that Bree can execute
- Jobs should use import.meta.dirname for path resolution (not process.cwd())
- Enable jobs in registry by setting `enabled: true` after job files are created

---

_Phase: 03-job-scheduling_ _Completed: 2026-01-22_

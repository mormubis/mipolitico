# Codebase Concerns

**Analysis Date:** 2026-01-20

## Tech Debt

**Missing Implementations in Change Detection:**
- Issue: Change detection service has multiple TODO comments for critical functionality that is not implemented
- Files: `apps/ingestion/src/detectors/change-detection.service.ts`
- Impact:
  - Line 288: Historical data storage is not persisted (only logs to console), losing audit trail
  - Line 320: Statistics generation returns zeroed placeholder data, breaking analytics
  - Line 342: Cleanup of historical data is not implemented, potential memory leak
- Fix approach: Implement actual persistence layer (database or file storage) for snapshots and change history

**Orphaned Backup File:**
- Issue: Main entry point has a `.backup.ts` version suggesting ongoing refactoring
- Files:
  - `apps/ingestion/src/main.backup.ts` (237 lines, complete pipeline implementation)
  - `apps/ingestion/src/main.ts` (59 lines, minimal Observable-based implementation)
- Impact: Code duplication and confusion about which entry point is canonical. Backup file references non-existent services (`DataSourceService`, `IngestionPipelineService`)
- Fix approach: Complete migration to new architecture in `main.ts` and remove backup, or revert to backup and continue with pipeline architecture

**Missing Service Directories:**
- Issue: Backup main file imports from `./connectors/data-source.service` and `./services/ingestion-pipeline.service` but these directories don't exist
- Files: `apps/ingestion/src/main.backup.ts` lines 6-8
- Impact: Backup entry point is non-functional, cannot be executed
- Fix approach: Either implement missing services or remove backup file

**Graceful Shutdown Incomplete:**
- Issue: Shutdown handler has TODO for cleanup operations
- Files: `apps/ingestion/src/main.backup.ts` line 217
- Impact: SIGINT/SIGTERM signals don't properly cancel running jobs, save state, or close browser/database connections, risking data loss
- Fix approach: Implement proper cleanup: cancel Observable subscriptions, close browser instances, persist in-flight data

**No Test Suite:**
- Issue: Test command exists but is a stub that fails
- Files: `apps/ingestion/package.json` line 29
- Impact: No test coverage for complex logic like change detection, data parsing, or error handling
- Fix approach: Add test framework (Jest/Vitest) and write tests for critical paths

**Browser Selection Logic Fragile:**
- Issue: Browser launcher retries by filtering out failed browsers but has unclear edge cases
- Files: `apps/ingestion/src/network/browser.ts` lines 83-88
- Impact: If all browsers fail, could loop infinitely or throw unclear errors. Filtering logic mutates global state
- Fix approach: Add maximum retry limit, clearer error messages, and avoid global state mutation

## Known Bugs

**Non-Null Assertions in Person Detail Scraping:**
- Symptoms: TypeScript non-null assertions (!) used on data that could be null/undefined
- Files: `apps/ingestion/src/sources/person-detail.ts` lines 207, 209, 211, 217
- Trigger: When scraping fails to find declaration URLs or photo, but error is caught and throws before assignment
- Workaround: Error handling wraps the extraction so it will error rather than silently assign undefined
- Issue: Code pattern suggests uncertainty about whether data will exist; better to validate with Zod schema and handle missing optional fields gracefully

**Mixed Error Handling Patterns:**
- Symptoms: Some errors thrown with `throw new Error()`, others use Observable error streams, some just log to console
- Files:
  - `apps/ingestion/src/sources/person-detail.ts` (throws errors)
  - `apps/ingestion/src/detectors/change-detection.service.ts` (console.log)
  - `apps/ingestion/src/network/browser.ts` (console.warn on line 84)
- Trigger: Inconsistent error propagation across the codebase
- Workaround: None, errors may be lost or not properly handled
- Fix: Standardize on Observable error streams for data pipeline, structured logging for services

## Security Considerations

**Hardcoded Legislature ID:**
- Risk: Person detail finder hardcodes legislature 15, may miss new legislatures
- Files: `apps/ingestion/src/sources/person-detail.ts` line 49
- Current mitigation: None
- Recommendations: Make legislature ID configurable or fetch current legislature dynamically

**No Rate Limiting on External APIs:**
- Risk: Scraping Spanish Congress website without rate limiting could trigger IP blocks
- Files:
  - `apps/ingestion/src/network/pool.ts` (concurrency limit of 5, line 5)
  - `apps/ingestion/src/network/browser.ts` (random delays 1-3 seconds, line 53)
- Current mitigation: Random delays between requests and concurrency limiting
- Recommendations: Add configurable rate limiting with proper backoff, respect robots.txt, monitor for 429 responses

**Deprecated Dependencies:**
- Risk: Multiple deprecated packages in pnpm-lock.yaml
- Files: `pnpm-lock.yaml` lines 206, 619, 1217, 1258, 1372, 1782, 1856, 2054
- Current mitigation: None visible
- Recommendations: Audit and update deprecated packages (glob@7, inflight, rimraf@<4)

## Performance Bottlenecks

**Browser Pool Concurrency:**
- Problem: Fixed concurrency limit of 5 in pool with random 1-5 second delays
- Files: `apps/ingestion/src/network/pool.ts` line 5
- Cause: Hardcoded limit may be too conservative for scraping or too aggressive for server
- Improvement path: Make concurrency configurable, add adaptive rate limiting based on response times

**Synchronous Change Detection:**
- Problem: Change detection uses synchronous cryptographic hashing in hot path
- Files: `apps/ingestion/src/detectors/change-detection.service.ts` lines 98-101, 267
- Cause: `crypto.createHash()` blocks event loop for each entity fingerprint
- Improvement path: Batch hashing operations or use worker threads for CPU-intensive crypto

**Large Type Definition File:**
- Problem: Congressional data types file is 371 lines, largest in codebase
- Files: `apps/ingestion/src/models/congressional-data.types.ts`
- Cause: All entity types in single file
- Improvement path: Split into separate files by domain (members, bills, votes, etc.)

## Fragile Areas

**Person Detail Scraping Promise.all:**
- Files: `apps/ingestion/src/sources/person-detail.ts` lines 95-201
- Why fragile: Single 12-element Promise.all with multiple CSS selectors, timeouts, and DOM queries. If HTML structure changes, entire extraction fails
- Safe modification: Extract each field to separate functions with independent error handling, allow partial success
- Test coverage: None

**Change Detection Fingerprinting:**
- Files: `apps/ingestion/src/detectors/change-detection.service.ts` lines 114-127
- Why fragile: Cleaning entity for fingerprinting uses field name strings that must match actual entity properties. Adding/renaming fields breaks change detection silently
- Safe modification: Use type-safe field references or derive ignored fields from schema
- Test coverage: None

**Browser Proxy Chains:**
- Files: `apps/ingestion/src/network/browser.ts` lines 27-82
- Why fragile: Nested Proxy objects for Browser and Page with method interception. Complex control flow tracking page lifecycle
- Safe modification: Extensive testing required for any changes. Consider extracting to separate rate limiter/pool class
- Test coverage: None

**Entity ID Generation Fallback:**
- Files: `apps/ingestion/src/detectors/change-detection.service.ts` lines 255-269
- Why fragile: Tries multiple field names then falls back to MD5 hash of entire entity. Different ID strategies could cause false positives in change detection
- Safe modification: Standardize on single ID strategy per entity type, validate IDs are unique
- Test coverage: None

## Scaling Limits

**In-Memory Snapshot Storage:**
- Current capacity: All entity snapshots stored in Map, unbounded growth
- Files: `apps/ingestion/src/detectors/change-detection.service.ts` line 32
- Limit: Will exhaust memory with large datasets (10k+ entities × multiple sources)
- Scaling path: Implement database-backed storage with pagination, or stream processing without full snapshot retention

**Single-Process Architecture:**
- Current capacity: All scraping in single Node process
- Files: `apps/ingestion/src/main.ts`
- Limit: CPU-bound on single core, memory bound by browser instances
- Scaling path: Add worker pool for parallel processing, distribute across multiple machines

## Dependencies at Risk

**oboe@2.1.5:**
- Risk: Last updated 2018, streaming JSON parser with limited maintenance
- Files: `apps/ingestion/package.json` line 3, used in `bureau.ts` and `person.ts`
- Impact: Used for streaming large JSON responses, alternative needed if deprecated
- Migration plan: Consider `stream-json` or native Node.js streams with JSON.parse

**playwright@1.55.0:**
- Risk: Browser automation is heavy and requires browser binaries
- Files: `apps/ingestion/package.json` line 9
- Impact: Large installation size, browser compatibility issues, potential for detection by anti-scraping
- Migration plan: Evaluate lighter alternatives (puppeteer-core, cheerio for static HTML) or official APIs

**zod@4.0.17:**
- Risk: Currently in v4 beta/alpha (stable is v3.x)
- Files: `apps/ingestion/package.json` line 13
- Impact: Using pre-release version may have breaking changes
- Migration plan: Monitor for v4 stable release or revert to v3.x if issues arise

## Missing Critical Features

**No Data Persistence:**
- Problem: All scraped data is processed but never stored
- Files: Current main.ts just logs data (line 58), no database writes
- Blocks: Cannot build queries, historical analysis, or API on top of ingested data
- Priority: High - core functionality missing

**No Incremental Scraping:**
- Problem: Change detection exists but no mechanism to skip unchanged pages or use ETags/Last-Modified
- Files: All retrievers fetch full data on every run
- Blocks: Efficient scheduled runs, reduces unnecessary load on source website
- Priority: Medium

**No Failure Recovery:**
- Problem: Failed scrapes are logged but not queued for retry
- Files: Observable errors in main.ts just log to console (line 55)
- Blocks: Reliable data completeness, requires manual reruns
- Priority: Medium

**No Observability:**
- Problem: Console.log statements throughout but no structured logging, metrics, or monitoring
- Files: console.log/warn/error in multiple files
- Blocks: Production deployment, debugging issues, performance monitoring
- Priority: Medium

## Test Coverage Gaps

**Change Detection Logic:**
- What's not tested: Fingerprint generation, change set computation, field comparison
- Files: `apps/ingestion/src/detectors/change-detection.service.ts`
- Risk: Silent bugs in change detection could miss updates or create false positives
- Priority: High

**Data Scrapers:**
- What's not tested: HTML parsing, schema validation, error handling
- Files: `apps/ingestion/src/sources/*.ts`
- Risk: Website changes break scraping silently, no validation of extracted data quality
- Priority: High

**Browser Pool Management:**
- What's not tested: Concurrent access, browser failure recovery, proxy behavior
- Files: `apps/ingestion/src/network/browser.ts`, `apps/ingestion/src/network/pool.ts`
- Risk: Race conditions, resource leaks, undefined behavior under load
- Priority: Medium

**Error Propagation:**
- What's not tested: End-to-end error handling from scraper through Observable to consumer
- Files: All retriever implementations
- Risk: Errors may be swallowed or cause unexpected crashes
- Priority: Medium

---

*Concerns audit: 2026-01-20*

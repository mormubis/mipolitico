# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Reactive Data Ingestion Pipeline with Observable Streams

**Key Characteristics:**
- Observable-based asynchronous data flow using RxJS
- Finder/Retriever pattern for data source abstraction
- Proxy-based resource pooling for rate limiting and browser management
- Stream-based JSON parsing for memory efficiency on large datasets
- Zod schema validation for runtime type safety

## Layers

**Entry Point:**
- Purpose: Orchestrates the ingestion pipeline by coordinating browser, network, and data sources
- Location: `apps/ingestion/src/main.ts`
- Contains: Pipeline initialization, needle generation, stream subscription
- Depends on: Network layer, Sources layer
- Used by: Node runtime (direct execution)

**Network Layer:**
- Purpose: Manages browser automation and HTTP requests with rate limiting and pooling
- Location: `apps/ingestion/src/network/`
- Contains: Browser launcher with Playwright, fetch wrapper, connection pool
- Depends on: Utils layer (for delays and randomization)
- Used by: Entry point, Sources layer

**Sources Layer:**
- Purpose: Implements data source scrapers using Finder/Retriever pattern
- Location: `apps/ingestion/src/sources/`
- Contains: Individual source modules (person, bureau, intervention, voting), type definitions
- Depends on: Network layer, Zod for validation
- Used by: Entry point

**Detectors Layer:**
- Purpose: Change detection and delta tracking for identifying data modifications
- Location: `apps/ingestion/src/detectors/`
- Contains: ChangeDetectionService, BaseDetector abstract class
- Depends on: Models layer
- Used by: (Not yet integrated in main.ts)

**Models Layer:**
- Purpose: TypeScript type definitions for Spanish Congressional data
- Location: `apps/ingestion/src/models/`
- Contains: Comprehensive interfaces for all entity types (CongressMember, Vote, Speech, etc.)
- Depends on: None
- Used by: Detectors layer, Sources layer (implicitly)

**Utilities:**
- Purpose: Shared helper functions
- Location: `apps/ingestion/src/utils.ts`
- Contains: random(), sleep(), romanize(), shuffle()
- Depends on: None
- Used by: Network layer, Sources layer

## Data Flow

**Ingestion Pipeline:**

1. **Initialization**: Browser launched with Playwright (randomized browser type: chromium/firefox/webkit)
2. **Discovery**: `finder()` navigates to data source page, extracts JSON endpoint URLs
3. **Normalization**: URLs converted to `Needle[]` objects (url + optional extra metadata)
4. **Retrieval**: `retriever()` creates Observable stream for each needle
5. **Streaming Parse**: Large JSON files parsed incrementally using oboe streaming parser
6. **Validation**: Each entity validated against Zod schema
7. **Emission**: Valid entities emitted through Observable to subscriber
8. **Error Handling**: Retry logic with 15-second delay, 1 retry attempt

**State Management:**
- Stateless pipeline with ephemeral execution
- Change detection service maintains in-memory snapshots (Map-based)
- No persistent state currently implemented

## Key Abstractions

**Finder:**
- Purpose: Discovers data source URLs through browser automation or API discovery
- Examples: `apps/ingestion/src/sources/person.ts` (lines 21-42), `apps/ingestion/src/sources/bureau.ts` (lines 19-44)
- Pattern: Async function receiving `{ browser, fetch }`, returns string | string[] | Needle[]

**Retriever:**
- Purpose: Fetches and streams data from discovered URLs as Observable
- Examples: `apps/ingestion/src/sources/person.ts` (lines 44-77), `apps/ingestion/src/sources/intervention.ts` (lines 26-102)
- Pattern: Function receiving `{ browser, fetch, url, extra? }`, returns Observable<T>

**Needle:**
- Purpose: Encapsulates data source location with optional metadata
- Examples: `apps/ingestion/src/sources/types.ts` (lines 15-18)
- Pattern: Interface with `url: string` and `extra?: unknown`

**Proxy Pattern for Rate Limiting:**
- Purpose: Wraps browser.newPage() and page.goto() to enforce delays and concurrency limits
- Examples: `apps/ingestion/src/network/browser.ts` (lines 27-82), `apps/ingestion/src/network/pool.ts` (lines 5-14)
- Pattern: ES6 Proxy intercepting method calls, injecting delays and pooling

**Change Detection:**
- Purpose: Fingerprint-based delta detection using SHA256 hashing
- Examples: `apps/ingestion/src/detectors/change-detection.service.ts` (lines 30-369)
- Pattern: Service class comparing current vs previous snapshots, returning ChangeSet<T>

## Entry Points

**Main Ingestion Script:**
- Location: `apps/ingestion/src/main.ts`
- Triggers: Manual execution via Node
- Responsibilities: Launch browser, execute finder/retriever pattern, log results, cleanup

**Backup Implementation:**
- Location: `apps/ingestion/src/main.backup.ts`
- Triggers: Not currently used
- Responsibilities: References DataSourceService, ChangeDetectionService, IngestionPipelineService (not yet implemented)

## Error Handling

**Strategy:** Observable-based error propagation with retry logic

**Patterns:**
- Retry on stream errors: `retry({ delay: 15000, count: 1 })` in `apps/ingestion/src/main.ts` (line 31)
- Try-catch in Observable constructors: Wraps async operations, calls `subscriber.error(e)`
- Browser fallback: If browser type fails to launch, tries next available type in `apps/ingestion/src/network/browser.ts` (lines 83-88)
- Error enrichment: Contextual error messages with cause chains

## Cross-Cutting Concerns

**Logging:** Console-based logging (console.log, console.error, console.warn)

**Validation:** Zod schemas defined per source, parsed inline during retrieval

**Authentication:** Not implemented (public data sources)

**Rate Limiting:**
- Global concurrency limit: 5 concurrent operations via `p-limit` in `apps/ingestion/src/network/pool.ts`
- Random delays: 1-5 seconds between operations, 1-3 seconds before page navigation
- Proxy-wrapped methods enforce delays automatically

---

*Architecture analysis: 2026-01-20*

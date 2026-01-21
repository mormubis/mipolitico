# Technology Stack: Spanish Congress Open Data API

**Project:** Spanish Congress Open Data API
**Researched:** 2026-01-21
**Context:** Node.js/TypeScript monorepo with existing scrapers (deputies, voting, speeches, bureau). Expanding to more sources, adding SQLite storage, creating HTTP API with daily refresh.
**Overall Confidence:** HIGH

---

## Executive Summary

For a legislative data API built on Node.js/TypeScript in 2025-2026, the recommended stack prioritizes:
- **Hono** for HTTP API framework (edge-ready, TypeScript-first, 3x faster than Express)
- **Drizzle ORM** for database layer (TypeScript-native, SQL-transparent, better performance than Prisma)
- **better-sqlite3** for SQLite driver (synchronous API, much faster than sqlite3)
- **Bree** for job scheduling (worker threads, cron support, database-independent)
- **Zod v4** for validation (already in use, battle-tested, excellent TypeScript integration)
- **Playwright** for scraping (already in use, superior reliability vs Puppeteer)

This stack aligns with 2025-2026 best practices while building on your existing choices (Playwright, Zod, p-limit).

---

## Recommended Stack

### Core Framework: HTTP API

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Hono** | ^4.x | HTTP API framework | **Recommended.** TypeScript-first, runs anywhere (Node.js, edge, serverless), 3x faster than Express with 40% less memory. Built on Web Standards. Benchmarks show 100K+ req/s. Ideal for public API that may scale to edge deployment. |
| Fastify | ^5.x | HTTP API framework (alternative) | **Alternative.** If Node.js-specific optimizations matter more than edge portability. 70-80K req/s, mature plugin ecosystem, strong TypeScript support. Choose if not targeting edge/serverless. |
| Express | ^5.x | HTTP API framework (not recommended) | **Not recommended for 2025.** Only 20-30K req/s, legacy codebase, limited TypeScript ergonomics. Use only if team has strong existing Express expertise. |

**Recommendation:** **Hono** for this project. Legislative data APIs benefit from edge deployment (global CDN distribution), and Hono's cross-runtime support future-proofs the architecture. TypeScript-first design aligns with existing codebase.

---

### Database Layer

#### ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Drizzle ORM** | ^0.36.x | Type-safe SQL query builder | **Recommended.** TypeScript-native with zero overhead, SQL-transparent (no magic), supports SQLite → PostgreSQL migration path. 1.6x faster type checking, 2.8x faster runtime than alternatives. Code-first schema (no separate schema language). Perfect for legislative data with complex queries. |
| Prisma | ^6.x | ORM (alternative) | **Alternative.** If DX and abstraction matter more than performance. Schema-first (.prisma file), excellent migrations, rich ecosystem. Heavier bundle, slower type checking. Choose if rapid prototyping is priority over performance. |

**Recommendation:** **Drizzle ORM**. Legislative data involves complex joins (deputies ↔ voting ↔ speeches ↔ bills) where SQL transparency is valuable. Performance matters for daily refresh jobs processing thousands of records.

#### SQLite Driver

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **better-sqlite3** | ^11.x | SQLite driver | **Recommended.** Synchronous API, much faster than sqlite3 (2000+ queries/s on 60GB database with 5-way joins). Handles real workloads efficiently. Drizzle ORM has first-class support. |
| sqlite3 | ^5.x | SQLite driver (current, not recommended) | **Not recommended.** Asynchronous API for CPU-bound operations (bad design), mutex thrashing, significantly slower. Your current choice—migrate to better-sqlite3. |
| node:sqlite | built-in | Node.js built-in SQLite (experimental) | **Avoid for now.** Experimental status (Node.js 22+), not production-ready. Better than sqlite3 but slower than better-sqlite3. Revisit in 6-12 months. |

**Recommendation:** **better-sqlite3**. Replace current sqlite3 dependency. Legislative data scraping is I/O-bound, but database writes during daily refresh are CPU-intensive—synchronous API with better performance is ideal.

---

### Job Scheduling: Daily Refresh

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Bree** | ^9.x | Job scheduler with worker threads | **Recommended.** Worker threads for sandboxed jobs, cron/human-friendly syntax, no database dependency (unlike Agenda/Bull). Supports async/await, retries, throttling, graceful shutdown. Built for production use (used by Forward Email, Cabin). Overkill for single daily job but provides growth path for per-source schedules. |
| node-cron | ^3.x | Simple cron scheduler (alternative) | **Alternative.** Minimal overhead, pure JS, full crontab syntax. Choose if you only need one daily cron job and don't need worker thread isolation. Simpler but less robust. |
| node-schedule | ^2.x | Flexible job scheduler (not recommended) | **Not recommended for 2025.** Less active maintenance, no worker thread support, smaller community vs Bree. |

**Recommendation:** **Bree**. Legislative data scraping should isolate jobs (deputies scraper crash shouldn't kill voting scraper). Worker threads provide this isolation. As you add more sources (bills, amendments, commissions), per-source scheduling becomes valuable.

---

### Data Validation & Schema Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | ^4.x (already in use) | Runtime validation & TypeScript schemas | **Keep current choice.** You're already using Zod v4. Excellent TypeScript integration, rich error handling (critical for API validation), large ecosystem. Zod v4 Mini reduced bundle size significantly (~4KB vs 15KB for v3). For legislative data with complex nested structures (bill amendments, voting breakdowns), Zod's composability shines. |
| Valibot | ^1.x | Runtime validation (alternative) | **Alternative.** 90% smaller bundle (1.37KB), similar runtime performance to Zod v4. Choose only if bundle size is critical (edge deployment with strict size limits). Smaller ecosystem, less mature error handling. |

**Recommendation:** **Zod v4** (already in use). Don't change. Bundle size is acceptable for Node.js server, error mapping to HTTP responses is excellent, and your team already knows it.

---

### Web Scraping (Already Chosen)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Playwright** | ^1.55.x (already in use) | Browser automation for scraping | **Keep current choice.** Superior reliability (96% success rate vs 75% for Puppeteer in 1000+ page tests), better auto-waiting for dynamic content, cross-browser support. Handles Spanish Congress site (likely built on government CMS with unpredictable load times) better than alternatives. |
| **RxJS** | ^7.x (already in use) | Reactive programming for async scraping | **Keep current choice.** Your `retrieve()` function uses Observable pattern for parallel scraping with retries. Excellent for orchestrating 100+ parallel fetches with backoff. |
| **p-limit** | ^7.x (already in use) | Concurrency control | **Keep current choice.** Lightweight, deterministic concurrency. Your current implementation limits parallel fetches to prevent server overload. Keep this for rate limiting. |

**Recommendation:** Keep all current scraping libraries. Your architecture (Playwright + RxJS + p-limit) is solid for 2025-2026 best practices.

---

### API Design & Documentation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Hono + Zod** | - | Type-safe API with runtime validation | **Recommended.** Hono has Zod middleware (`zValidator`) for request validation. Define schemas once, get TypeScript types + runtime validation. No code generation needed. |
| trpc-openapi | ^2.x | OpenAPI spec generation from tRPC (alternative) | **Alternative.** If you want tRPC's end-to-end type safety + OpenAPI docs for external consumers. More complex setup, but gives you REST + type-safe client. Consider if building public SDK. |
| OpenAPI 3.x | - | Manual API documentation | **Avoid.** Don't write OpenAPI specs manually. Use Zod schemas → generate OpenAPI if needed (hono-openapi package exists). |

**Recommendation:** **Hono + Zod + hono-openapi**. Define validation schemas with Zod, apply via Hono middleware, generate OpenAPI spec for documentation. Simple, type-safe, no code generation complexity.

---

### Caching Strategy

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **HTTP Cache-Control** | - | Standard HTTP caching | **Recommended.** Legislative data changes daily (your refresh schedule). Set `Cache-Control: public, max-age=86400` (24h) on GET endpoints. Undici v7+ (Node.js 22+ fetch) supports RFC-9111 compliant client-side caching. Free CDN caching. |
| apicache | ^1.x | In-memory API response cache (alternative) | **Alternative.** If you need route-level caching with custom invalidation. Middleware for Express/Hono. Simpler than Redis for single-server deployment. Consider if you need to invalidate cache mid-day (e.g., breaking news vote). |
| Redis | ^7.x | External cache (not recommended initially) | **Defer.** Adds operational complexity. Only needed for multi-server deployment or complex invalidation patterns. Start with HTTP caching + in-memory (apicache if needed). |

**Recommendation:** Start with **HTTP Cache-Control headers**. Legislative data is perfect for time-based caching (daily refresh = 24h TTL). Add apicache if you need route-specific caching before daily refresh completes.

---

### Rate Limiting & Scraping Compliance

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **p-limit** | ^7.x (already in use) | Concurrency limiting | **Keep.** Limits parallel requests to prevent overwhelming Congress servers. Essential for ethical scraping. |
| **Exponential backoff** | - | Retry strategy | **Add.** When receiving 429/503, implement exponential backoff (2s → 4s → 8s delays). Your current `retry({ delay: 15000, count: 1 })` is static—make it exponential. |
| **User-Agent rotation** | - | Anti-detection | **Add.** Randomize User-Agent headers to mimic normal browsing. Government sites may rate-limit based on UA. |
| **Request delays** | - | Polite scraping | **Add.** 2-5 second delays between requests (randomized) to mimic human behavior. Prevents detection + reduces server strain. |

**Recommendation:** Keep p-limit, add exponential backoff to RxJS retry logic, add randomized delays (2-5s) between requests, rotate User-Agent headers.

---

## Database Migration Path: SQLite → PostgreSQL

| Phase | Database | When | Why |
|-------|----------|------|-----|
| **Phase 1 (MVP)** | SQLite (better-sqlite3) | Now | Single-file database, zero operational overhead, handles 100K+ records easily. Perfect for development + initial production. |
| **Phase 2 (Scale)** | PostgreSQL 16+ | When you hit 1M+ records OR need multi-server deployment | Concurrent writes, advanced indexing, full-text search, replication. Migration tools: pgloader (automatic) or custom scripts. |

**Migration strategy:**
1. Use Drizzle ORM from day one (abstracts SQLite vs PostgreSQL differences)
2. Write Drizzle schemas compatible with both (avoid SQLite-specific features like `AUTOINCREMENT`—use `SERIAL` pattern)
3. When ready to migrate: pgloader for data transfer, Drizzle migrations for schema, test in staging with production data copy
4. Expected downtime: 2-4 hours for <100K records, 24+ hours for 1M+ records

**Trigger for migration:** When daily refresh takes >1 hour OR API response times exceed 500ms p95 OR you need geographic replication.

---

## Supporting Libraries

### Already in Use (Keep)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| oboe | ^2.1.5 | Streaming JSON parser | Good for large JSON responses from Congress API. Keep. |
| p-deferred | ^1.0.0 | Promise utilities | Lightweight, useful. Keep. |
| p-queue | ^9.x | Advanced queue with priorities | More features than p-limit (priorities, timeouts). Keep if using priority queues, otherwise p-limit is sufficient. |
| p-retry | ^7.x | Retry with backoff | Overlaps with RxJS retry. Consolidate—either use RxJS retry OR p-retry, not both. |

### Recommended Additions

| Library | Version | Purpose | Why |
|---------|---------|---------|-------|
| **@hono/node-server** | ^1.x | Hono adapter for Node.js | Required to run Hono on Node.js (vs edge runtime). |
| **@hono/zod-validator** | ^0.x | Zod middleware for Hono | Request validation with Zod schemas. |
| **drizzle-orm** | ^0.36.x | ORM | Type-safe database queries. |
| **drizzle-kit** | ^0.28.x | Drizzle migration tool | Schema migrations, introspection. |
| **drizzle-zod** | ^0.x | Generate Zod schemas from Drizzle | Keep schemas in sync (database ↔ API validation). |
| **bree** | ^9.x | Job scheduler | Daily refresh orchestration. |
| **date-fns** or **luxon** | ^3.x / ^3.x | Date manipulation | Legislative data has complex date handling (session dates, vote timestamps). Pick one. date-fns is lighter (tree-shakeable), Luxon has better i18n. |

---

## Installation

```bash
# Remove outdated dependencies
pnpm remove sqlite3

# Add core dependencies
pnpm add hono @hono/node-server @hono/zod-validator
pnpm add drizzle-orm drizzle-zod better-sqlite3
pnpm add bree
pnpm add date-fns

# Add dev dependencies
pnpm add -D drizzle-kit @types/better-sqlite3
```

---

## API Versioning Strategy

**Recommendation:** URL Path Versioning (`/api/v1/...`)

**Rationale:**
- UK Parliament API, Congress.gov API, European Parliament API all use URL path versioning
- Explicit, cacheable, works with CDN/load balancers
- Simple to route in Hono: `app.route('/api/v1', v1Router)`

**Implementation:**
```typescript
// /api/v1/deputies
// /api/v1/voting
// /api/v2/deputies (breaking change)
```

**Deprecation policy (follow UK Parliament model):**
- Support v1 for 1 year after v2 release
- Add `Deprecation: true` header to v1 responses 6 months before sunset
- Add `Sunset: <date>` header 3 months before sunset

---

## Confidence Assessment

| Category | Confidence | Rationale |
|----------|------------|-----------|
| HTTP Framework (Hono) | **HIGH** | Multiple 2025-2026 sources confirm Hono as best TypeScript-first framework. Benchmarks, real-world usage, active development. |
| ORM (Drizzle) | **HIGH** | Consensus in 2025 Node.js ORM comparisons: Drizzle for performance, Prisma for DX. Your use case (complex queries, performance) favors Drizzle. |
| SQLite Driver (better-sqlite3) | **HIGH** | Benchmark data, community consensus, proven at scale. Clear upgrade from sqlite3. |
| Job Scheduler (Bree) | **MEDIUM-HIGH** | Well-documented, production usage confirmed, but smaller ecosystem than node-cron. Risk: smaller community. Mitigation: worker thread isolation is worth it. |
| Caching Strategy | **MEDIUM** | HTTP caching best practices well-documented, but Undici HTTP cache is newer (v7.0.0). Risk: edge cases. Mitigation: fallback to apicache if needed. |
| Migration Path | **HIGH** | SQLite → PostgreSQL is well-trodden path. Drizzle supports both. pgloader is battle-tested. |

---

## Risks & Mitigations

### Risk 1: Hono Ecosystem Maturity
**Risk:** Hono is newer than Express/Fastify. Fewer third-party middlewares.
**Mitigation:** Hono runs on Web Standards (Request/Response), so many Node.js middlewares work with adapters. Active development, growing ecosystem. Fallback: Fastify (mature, fast).

### Risk 2: Drizzle Migration Complexity
**Risk:** Migrating from raw SQL/Prisma to Drizzle has learning curve.
**Mitigation:** You don't have existing ORM code (using raw sqlite3). Drizzle is SQL-transparent—write SQL-like TypeScript. Start with one table (deputies), expand incrementally.

### Risk 3: better-sqlite3 Synchronous API
**Risk:** Synchronous API blocks event loop on large queries.
**Mitigation:** Worker threads (via Bree) isolate blocking operations. For API queries, use Drizzle query builder to optimize (proper indexes, LIMIT clauses). Monitor query times.

### Risk 4: Bree Worker Thread Overhead
**Risk:** Worker threads have spawn overhead (50-100ms).
**Mitigation:** Daily jobs run off critical path (background). For simple daily cron, node-cron is valid alternative.

---

## Sources

### HTTP Frameworks
- [Hono vs. Express vs. Fastify: The 2025 Architecture Guide](https://levelup.gitconnected.com/hono-vs-express-vs-fastify-the-2025-architecture-guide-for-next-js-5a13f6e12766)
- [Fastify vs Express vs Hono: Choosing the Right Framework](https://medium.com/@arifdewi/fastify-vs-express-vs-hono-choosing-the-right-node-js-framework-for-your-project-da629adebd4e)
- [Beyond Express: Fastify vs. Hono](https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i)
- [Hono vs Fastify | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)

### Data Validation
- [Zod vs. Valibot: Which Validation Library](https://dev.to/sheraz4194/zod-vs-valibot-which-validation-library-is-right-for-your-typescript-project-303d)
- [TypeScript Data Validators at Scale: zod, valibot, superstruct Compared](https://medium.com/@2nick2patel2/typescript-data-validators-at-scale-zod-valibot-superstruct-compared-177581543ac5)

### Job Scheduling
- [Bree - Node.js and JavaScript Job Task Scheduler](https://github.com/breejs/bree)
- [Node.js Job Scheduler Code Example in 2025](https://forwardemail.net/en/blog/docs/node-js-job-scheduler-cron)
- [Job Scheduling in Node.js with Node-cron](https://betterstack.com/community/guides/scaling-nodejs/node-cron-scheduled-tasks/)

### Database & ORM
- [Drizzle vs Prisma: the Better TypeScript ORM in 2025](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Drizzle vs Prisma: Choosing the Right TypeScript ORM](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/)
- [better-sqlite3 - The fastest SQLite library for Node.js](https://github.com/WiseLibs/better-sqlite3)
- [SQLite Driver Benchmark: better-sqlite3 vs node:sqlite](https://sqg.dev/blog/sqlite-driver-benchmark)
- [SQLite to PostgreSQL Migration Guide 2025](https://www.nihardaily.com/93-how-to-convert-sqlite-to-postgresql-step-by-step-migration-guide-for-developers)

### Caching
- [Bringing HTTP Caching to Node.js](https://blog.platformatic.dev/bringing-http-caching-to-nodejs)
- [Caching in Node.js to optimize app performance](https://blog.logrocket.com/caching-node-js-optimize-app-performance/)

### Web Scraping
- [Playwright vs Puppeteer: Which Web Scraping Tool Wins in 2025?](https://www.promptcloud.com/blog/playwright-vs-puppeteer-for-web-scraping/)
- [Web Scraping Best Practices in 2025](https://www.scrapingbee.com/blog/web-scraping-best-practices/)
- [Ultimate Guide to Web Scraping with JavaScript & Node.js (2025 Edition)](https://www.browserless.io/blog/javascript-nodejs-web-scraping)
- [p-limit Guide: Run multiple promise-returning & async functions](https://generalistprogrammer.com/tutorials/p-limit-npm-package-guide)

### API Design
- [8 API Versioning Best Practices for Developers in 2026](https://getlate.dev/blog/api-versioning-best-practices)
- [API Design Best Practices: Building Scalable REST APIs in 2026](https://hakia.com/engineering/api-design-best-practices/)

### Legislative Data APIs
- [UK Parliament Developer Hub](https://developer.parliament.uk/)
- [Congress.gov API | Library of Congress](https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/)
- [European Parliament's Open Data Portal - Developers' corner](https://data.europarl.europa.eu/en/developer-corner/opendata-api)
- [Legislative Data - Handbook of Parliamentary Affairs](https://cis.pubpub.org/pub/legislative-data/release/7)

---

## Next Steps for Implementation

1. **Phase 1: Database Layer**
   - Install better-sqlite3, drizzle-orm, drizzle-kit
   - Define Drizzle schemas for existing data (deputies, voting, speeches, bureau)
   - Migrate from raw sqlite3 queries to Drizzle
   - Set up migrations with drizzle-kit

2. **Phase 2: HTTP API**
   - Install Hono, @hono/node-server, @hono/zod-validator
   - Create v1 routes: `/api/v1/deputies`, `/api/v1/voting`, etc.
   - Add Zod validation for query parameters (date ranges, filters)
   - Implement Cache-Control headers (max-age=86400)

3. **Phase 3: Job Scheduling**
   - Install Bree
   - Extract scraping logic to jobs (`jobs/scrape-deputies.ts`, `jobs/scrape-voting.ts`)
   - Configure daily cron schedule
   - Add job monitoring/logging

4. **Phase 4: Expand Data Sources**
   - Add bills, amendments, commissions scrapers
   - Extend Drizzle schema
   - Add API endpoints for new data

5. **Phase 5: Monitoring & Optimization**
   - Add query performance monitoring
   - Optimize database indexes
   - Consider PostgreSQL migration trigger metrics

**Estimated timeline:** 2-3 weeks for Phases 1-2 (database + API), 1 week for Phase 3 (scheduling), ongoing for Phase 4 (new sources).

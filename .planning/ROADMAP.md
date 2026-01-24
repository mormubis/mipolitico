# Roadmap: Spanish Congress Open Data API

## Overview

The Spanish Congress Open Data API transforms fragmented congressional data into
a unified, searchable HTTP API. Starting with database persistence for existing
scrapers, we expose data through a versioned REST API with filtering and
pagination, automate daily refreshes, expand to commissions data, and add
production monitoring. Each phase delivers a complete, verifiable capability
that builds toward a public-ready API researchers and journalists can depend on.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3, 4, 5): Planned milestone work
- Decimal phases (e.g., 2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Storage Layer Foundation** - Persist scraped data in SQLite
      with Repository pattern
- [x] **Phase 2: HTTP API Layer** - REST API with filtering, pagination,
      caching, and documentation
- [x] **Phase 3: Job Scheduling** - Automate daily refresh for all data sources
- [ ] **Phase 4: Data Expansion** - Add commissions scraper and complete v1
      coverage
- [ ] **Phase 5: Production Readiness** - Monitoring, error tracking, and
      optimization

## Phase Details

### Phase 1: Storage Layer Foundation

**Goal**: All scraped data persists reliably in SQLite with idempotent writes
and schema validation.

**Depends on**: Nothing (first phase)

**Requirements**: REQ-009, REQ-010, REQ-011

**Success Criteria** (what must be TRUE):

1. Deputy data scraped by person.ts writes to SQLite database without duplicates
2. Voting records scraped by voting.ts write to database with UPSERT operations
3. Interventions and bureau members persist to database tables
4. Re-running any scraper updates existing records instead of creating
   duplicates
5. Zod schema validation rejects malformed data before database writes

**Plans**: 3 plans

Plans:

- [x] 01-01-PLAN.md — Database package with Prisma schema for all congressional
      entities
- [x] 01-02-PLAN.md — Repository functions with Zod validation and UPSERT
      operations
- [x] 01-03-PLAN.md — Scraper integration with RxJS database sink operators

---

### Phase 2: HTTP API Layer

**Goal**: Public REST API serves all congressional data with filtering,
pagination, caching, and documentation.

**Depends on**: Phase 1

**Requirements**: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007,
REQ-008, REQ-013

**Success Criteria** (what must be TRUE):

1. User can GET `/api/v1/deputies` and receive paginated list of deputy records
2. User can GET `/api/v1/votes/:legislature/:session/:number` and receive
   complete voting record
3. User can filter deputies by legislature, status, or name using query
   parameters
4. User can filter votes by date range and see only results matching criteria
5. User can paginate through large result sets using limit and offset parameters
6. User receives proper HTTP 400 error with JSON explanation for invalid filters
7. User can access OpenAPI documentation describing all endpoints and parameters
8. HTTP responses include Cache-Control headers appropriate for data freshness

**Plans**: 4 plans in 3 waves

Plans:

- [x] 02-01-PLAN.md — API package setup and Fastify server foundation (Wave 1)
- [x] 02-02-PLAN.md — Database query functions with filtering/pagination
      (Wave 1)
- [x] 02-03-PLAN.md — Entity endpoints with filtering, pagination, caching
      (Wave 2)
- [x] 02-04-PLAN.md — OpenAPI documentation and Swagger UI (Wave 3)

---

### Phase 3: Job Scheduling

**Goal**: All data sources refresh automatically on daily schedule without
manual intervention.

**Depends on**: Phase 2

**Requirements**: Daily refresh automation (implicit)

**Success Criteria** (what must be TRUE):

1. Deputies scraper runs automatically every day at scheduled time
2. Voting records scraper runs on independent schedule from other scrapers
3. When one scraper fails, other scrapers continue running successfully
4. Scraper job logs show execution time, success/failure, and record counts
5. Database contains fresh data updated within last 24 hours

**Plans**: 3 plans in 3 waves

Plans:

- [x] 03-01-PLAN.md — Bree scheduler setup and configuration (Wave 1)
- [x] 03-02-PLAN.md — Per-source job isolation with independent scheduling
      (Wave 2)
- [x] 03-03-PLAN.md — Error handling, retry logic, and freshness tracking
      (Wave 3)

---

### Phase 4: Data Expansion

**Goal**: API serves commissions data completing v1 data source coverage.

**Depends on**: Phase 3

**Requirements**: Commissions scraper (implicit)

**Success Criteria** (what must be TRUE):

1. User can GET `/api/v1/commissions` and receive list of congressional
   commissions
2. Commission records include members, meeting dates, and commission metadata
3. Commissions data refreshes daily alongside other sources
4. All 5 v1 data sources (deputies, votes, speeches, bureaus, commissions) are
   queryable via API

**Plans**: TBD

Plans:

- [ ] 04-01: Commissions data source research
- [ ] 04-02: Commissions scraper implementation
- [ ] 04-03: API endpoint integration

---

### Phase 5: Production Readiness

**Goal**: API runs reliably with monitoring, error tracking, and performance
optimization.

**Depends on**: Phase 4

**Requirements**: REQ-012 (change detection completion), monitoring
infrastructure (implicit)

**Success Criteria** (what must be TRUE):

1. Change detection service tracks what changed between daily refreshes
2. API logs capture all requests with status codes, response times, and client
   IPs
3. Scraper errors send alerts when failure rate exceeds threshold
4. API response time (p95) measured and tracked over time
5. Database query performance analyzed with slow query identification

**Plans**: TBD

Plans:

- [ ] 05-01: Change detection service completion
- [ ] 05-02: Logging and monitoring setup
- [ ] 05-03: Performance analysis and optimization

---

## Progress

**Execution Order:** Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase                       | Plans Complete | Status      | Completed  |
| --------------------------- | -------------- | ----------- | ---------- |
| 1. Storage Layer Foundation | 3/3            | Complete    | 2026-01-21 |
| 2. HTTP API Layer           | 4/4            | Complete    | 2026-01-22 |
| 3. Job Scheduling           | 3/3            | Complete    | 2026-01-24 |
| 4. Data Expansion           | 0/3            | Not started | -          |
| 5. Production Readiness     | 0/3            | Not started | -          |

---

## Requirement Traceability

| Requirement | Phase   | Description                             |
| ----------- | ------- | --------------------------------------- |
| REQ-001     | Phase 2 | REST API with v1 versioning             |
| REQ-002     | Phase 2 | Entity retrieval endpoints              |
| REQ-003     | Phase 2 | Filtering capabilities                  |
| REQ-004     | Phase 2 | Pagination                              |
| REQ-005     | Phase 2 | Export format (JSON)                    |
| REQ-006     | Phase 2 | API documentation (OpenAPI)             |
| REQ-007     | Phase 2 | Rate limiting (client IP tracking)      |
| REQ-008     | Phase 2 | Error handling                          |
| REQ-009     | Phase 1 | SQLite database with Repository pattern |
| REQ-010     | Phase 1 | Idempotent data writes (UPSERT)         |
| REQ-011     | Phase 1 | Schema validation with Zod              |
| REQ-012     | Phase 5 | Change detection service completion     |
| REQ-013     | Phase 2 | HTTP Cache headers                      |
| Implicit-01 | Phase 3 | Daily refresh automation                |
| Implicit-02 | Phase 4 | Commissions scraper                     |
| Implicit-03 | Phase 5 | Monitoring and observability            |

**Coverage**: 13 explicit requirements + 3 implicit requirements = 16 total
requirements mapped

---

_Last updated: 2026-01-24_ _Next: Plan Phase 4 (Data Expansion) with /gsd:plan-phase 4_

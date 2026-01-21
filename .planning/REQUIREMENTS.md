# Requirements: Spanish Congress Open Data API

**Defined:** 2026-01-21
**Status:** Ready for roadmap creation
**Scope Phase:** v1 (MVP), v2 (Expansion), Backlog (Deferred)

---

## Project Vision

A public HTTP API that aggregates and makes searchable all open data from Spain's Congress (congreso.es). Researchers and journalists can search across deputies, voting records, bills, amendments, commissions, and procedural records to understand legislative activity and decisions.

---

## v1 Scope (MVP - Weeks 1-4)

Foundation API with existing data sources and basic querying.

### Data Sources Included

- [x] **Deputies** — Member profiles with party, district, seat number, current status
- [x] **Voting Records** — Individual votes with deputy positions, vote totals, dates, outcome
- [x] **Speeches/Interventions** — Congressional debates and speeches by deputy and date
- [x] **Bureau Members** — Congressional leadership and committee chairs with roles
- [x] **Commissions** — Committee/commission list with members and meeting information *(scraper to be built)*

**Not included in v1:** Bills and amendments (deferred to v2)

### API Design

**REQ-001: REST API with v1 versioning**
- Endpoints: `/api/v1/deputies`, `/api/v1/votes`, `/api/v1/speeches`, `/api/v1/bureaus`, `/api/v1/commissions`
- Versioning via URL path (`/api/v1/...`)
- All endpoints return JSON (primary format)
- Query parameters for filtering and pagination

**REQ-002: Entity retrieval endpoints**
- `GET /api/v1/deputies` — List all deputies with pagination
- `GET /api/v1/deputies/:id` — Get individual deputy by ID
- `GET /api/v1/votes` — List all votes with pagination
- `GET /api/v1/votes/:legislature/:session/:number` — Get individual vote with complete results
- `GET /api/v1/speeches` — List speeches with pagination
- `GET /api/v1/bureaus` — List bureau members
- `GET /api/v1/commissions` — List commissions

**REQ-003: Filtering capabilities**
- Date range filtering: `?date_from=2024-01-01&date_to=2024-12-31`
- Chamber/legislature filtering: `?legislature=15&chamber=congress`
- Person filtering: `?deputy=:id` or `?deputy_name=searchterm`
- Status filtering: `?status=active|historical`
- Combine multiple filters: `?date_from=2024-01-01&legislature=15&deputy=12345`

**REQ-004: Pagination**
- Default limit: 20 results per page
- Max limit: 250 results per page
- Offset-based: `?limit=50&offset=100`
- Response includes: `total_count`, `limit`, `offset` for client-side calculation

**REQ-005: Export format**
- JSON only for v1 (primary API responses)
- CSV export deferred to v2 (can add `?format=csv` later)
- Bulk download archives deferred to v2

**REQ-006: API documentation**
- OpenAPI 3.x specification
- Example requests and responses for each endpoint
- Filtering guide and query parameter documentation
- Error codes and status codes documented

**REQ-007: Rate limiting**
- No rate limits for v1 (remove friction for early adopters)
- API key requirement deferred to v2 (if abuse becomes apparent)
- Client IP tracking for monitoring only (no throttling)

**REQ-008: Error handling**
- HTTP status codes: 400 (bad request), 404 (not found), 500 (server error)
- JSON error responses: `{ "error": "message", "status": 400 }`
- Clear error messages for invalid filters or parameters

### Storage

**REQ-009: SQLite database with Repository pattern**
- Use better-sqlite3 driver (replace current sqlite3)
- Implement Repository pattern for data access abstraction
- Allows future zero-downtime migration to PostgreSQL (Phase 5)
- Schema includes: deputies, votes, speeches, bureau_members, commissions tables
- Indexes on common query fields (date, legislature, person_id)

**REQ-010: Idempotent data writes**
- UPSERT operations: INSERT OR REPLACE on conflict
- Prevents duplicate records on scraper retry
- Enables safe daily refresh without data accumulation

### Data Validation

**REQ-011: Schema validation**
- Zod schemas for all API responses (already in use)
- Validate scraped data at ingestion time
- Return validation errors in response

### Change Detection (Internal Use)

**REQ-012: Change detection service (already partially implemented)**
- Track what changed between daily refreshes
- Used internally for monitoring and diagnostics
- NOT exposed via API in v1 (deferred to v2 as optional query endpoint)

### Caching

**REQ-013: HTTP Cache headers**
- `Cache-Control: public, max-age=3600` (1 hour) for stable historical data
- `Cache-Control: public, max-age=300` (5 minutes) for recent data and "latest" queries
- ETag support for conditional requests
- CDN-friendly for future scaling

---

## v2 Scope (Expansion - Month 2+)

Features that enhance the API but are not critical for v1.

### Data Sources

- [ ] **Bills and Amendments** — Legislative proposals with text, status, amendments, sponsors
- [ ] **Financial Data** — Deputy declarations, budget voting
- [ ] **Procedural Records** — Additional legislative procedures and outcomes

### Query Enhancements

- [ ] **Multi-criteria complex queries** — Combine arbitrary filters without N+1 API calls
- [ ] **Sorting options** — Sort by date (asc/desc), name, vote count
- [ ] **Bulk downloads** — Per-legislature archives (JSON/CSV) for offline analysis
- [ ] **Relationship queries** — "Find all deputies voting together", "Bills by topic"
- [ ] **Field selection** — GraphQL-style sparse fieldsets to reduce payload

### Search & Discovery

- [ ] **Full-text search** — Search bill content, speech text, vote titles
- [ ] **Advanced search operators** — Boolean (AND/OR/NOT), phrase matching, proximity
- [ ] **Aggregation endpoints** — Pre-computed statistics (votes by party, attendance rates)

### API Evolution

- [ ] **API versioning strategy** — Add v2 endpoints when breaking changes needed
- [ ] **CSV export** — `?format=csv` option on list endpoints
- [ ] **Rate limiting with tiers** — Free tier (5,000 req/hour), premium tier (higher limits)
- [ ] **API key requirement** — Track and manage API consumers
- [ ] **GraphQL layer** — Optional GraphQL endpoint on top of REST for power users

### Observability

- [ ] **Change detection endpoint** — Allow clients to poll for what's changed since last fetch
- [ ] **Health check endpoint** — API status and data freshness timestamp
- [ ] **Usage analytics** — Track which endpoints are most used
- [ ] **Data staleness alerts** — Notify when data hasn't updated for X hours

---

## Out of Scope (Backlog/Future)

Features that are valuable but explicitly deferred or rejected for now.

### Rejected for v1/v2

- **User authentication/authorization** — Data is public, not needed for v1. Add if private/paid tiers emerge.
- **User accounts and personalization** — API is read-only data access, not a user platform.
- **Real-time webhooks** — Daily refresh cadence is sufficient. Congress doesn't update real-time.
- **Mobile app** — API is the interface. Clients can build their own mobile apps on top.

### Deferred (Future phases)

- **PostgreSQL migration** — Deferred to Phase 5+ when data volume or traffic demands it
- **Full-text search** — Requires indexing infrastructure. Plan for Phase 3+.
- **Relationship mapping visualizations** — API is data layer. Visualization is client responsibility.
- **Multi-language support** — API responses in Spanish only for v1. i18n deferred.
- **GraphQL support** — REST is sufficient for v1. Add GraphQL layer in v2 if demand exists.

---

## Success Criteria for v1

API is ready to ship when:

- [x] All v1 requirements implemented (REQ-001 through REQ-013)
- [x] Data from all v1 sources (deputies, votes, speeches, bureau, commissions) is scraped and stored
- [x] All 5 main endpoints respond with correct filtering and pagination
- [x] Documentation is complete with examples
- [x] Error handling covers all edge cases (missing fields, invalid filters)
- [x] Change detection is functional (tracks between refreshes)
- [x] Cache headers are properly set
- [x] Repository pattern is implemented (enables future PostgreSQL migration)
- [x] Tests pass for critical paths (data parsing, schema validation, API responses)

---

## Assumptions & Constraints

**Assumptions:**
- Spanish Congress (congreso.es) allows scraping per robots.txt and terms of use
- Daily refresh frequency is sufficient for user needs
- Researchers and journalists are primary users (not public consumers)
- Data is public domain or licensed for public use

**Constraints:**
- Must respect congreso.es rate limits (check robots.txt, implement 10-15 sec/request delays)
- SQLite suitable for v1 (dataset expected <1GB)
- No user authentication or payment processing needed for v1
- Deployment target: single server (multi-server scaling deferred)

---

## Questions for Research (Phase 1 Implementation)

These should be answered during Phase 1 research before starting Phase 2:

1. **Commissions data structure** — How are commissions organized on congreso.es? API endpoint or HTML to scrape?
2. **Data completeness** — Should API include historical legislatures (14th, 13th, etc.) or only current (15th)?
3. **Bulk data freshness** — What's the maximum staleness acceptable before API warns users?
4. **Query complexity** — Will researchers need complex multi-criteria queries, or simple filters sufficient?
5. **Rate limiting tolerance** — Empirically test what rate congress.es allows without blocking

---

## Mapping to Roadmap Phases

**Phase 1: Storage Layer** → Implements REQ-009, REQ-010, REQ-011
**Phase 2: HTTP API** → Implements REQ-001 through REQ-008, REQ-013
**Phase 3: Job Scheduling** → Automates data refresh for all v1 sources
**Phase 4: Expand Data** → Adds commissions scraper, other sources
**Phase 5: Monitoring & Optimization** → Adds observability, considers PostgreSQL migration (REQ-009 alternative)

---

*Requirements defined: 2026-01-21*
*Next: Roadmap creation with phase breakdown*

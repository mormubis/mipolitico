# Spanish Congress Open Data API

## What This Is

A public HTTP API that aggregates and makes searchable all open data from Spain's Congress (congreso.es). Researchers and journalists can search across deputies, voting records, bills, amendments, commissions, and procedural records to understand legislative activity and decisions.

## Core Value

Researchers and journalists can search across all Spanish Congress open data in one place to find what they need — instead of navigating multiple fragmented sources on congreso.es.

## Requirements

### Validated

- ✓ Deputy data scraping (person.ts) — existing
- ✓ Voting records scraping (voting.ts) — existing
- ✓ Intervention/speech scraping (intervention.ts) — existing
- ✓ Bureau member scraping (bureau.ts) — existing
- ✓ Change detection system — existing
- ✓ Network rate limiting & pooling — existing
- ✓ Person detail scraping — existing

### Active

- [ ] Expand scrapers: Bills & amendments
- [ ] Expand scrapers: Commissions & committees
- [ ] Expand scrapers: Financial/budget data
- [ ] Expand scrapers: Additional procedural records
- [ ] SQLite storage layer for all sources
- [ ] Daily refresh scheduler
- [ ] HTTP API with search interface
- [ ] Query across all data sources
- [ ] Data validation & error handling
- [ ] API documentation

### Out of Scope

- PostgreSQL migration — future phase when data volume demands it
- User authentication/authorization — not needed for public v1
- Advanced analytics/visualization — frontend layer, separate from API
- Real-time updates — daily refresh is sufficient
- Mobile apps — API is the interface

## Context

**Existing Foundation:**
- Monorepo with pnpm/Nx
- TypeScript with RxJS for streaming data
- Playwright for browser automation and scraping
- Zod for schema validation
- Existing scrapers follow Finder/Retriever pattern
- Change detection service partially implemented (TODOs noted in codebase map)

**Technical Debt in Codebase:**
- Change detection has TODO markers for storage persistence
- Graceful shutdown not fully implemented
- No test suite
- Main entry point has backup version suggesting refactoring in progress
- SQLite imported but never used

**Target Users:**
- Researchers analyzing legislative patterns
- Journalists investigating congressional activity
- Developers building tools on Congress data
- Citizens interested in parliamentary transparency

## Constraints

- **Timeline**: Prototype in weeks (MVP focus)
- **Storage**: SQLite initially (migrate to PostgreSQL later)
- **Deployment**: TBD (local/self-hosted or cloud)
- **Refresh**: Daily is sufficient
- **Tech stack**: Locked to Node.js/TypeScript (existing codebase)
- **Budget**: Scraping must respect congreso.es rate limits and robots.txt

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite first, PostgreSQL later | Fast to prototype, can migrate when data grows | — Pending |
| HTTP API for access | Standard interface, easy for researchers to integrate | — Pending |
| Daily refresh cycle | Congress pace is daily, sufficient for transparency use case | — Pending |
| Search-first interface | Core value is finding data in one place | — Pending |

---

*Last updated: 2026-01-21 after initialization*

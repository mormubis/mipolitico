# Research Summary: Spanish Congress Open Data API

**Domain:** Legislative/Parliamentary Open Data API
**Researched:** 2026-01-21
**Overall Confidence:** HIGH

---

## Executive Summary

The Spanish Congress Open Data API project sits in a well-established domain with mature patterns from UK Parliament, US Congress.gov, and European Parliament APIs. The 2025-2026 Node.js/TypeScript ecosystem provides excellent tooling for this use case:

**Key findings:**
1. **Modern HTTP frameworks (Hono, Fastify) significantly outperform Express** (3-4x faster, better TypeScript integration)
2. **Drizzle ORM is the 2025 consensus choice** for TypeScript projects valuing performance and SQL transparency
3. **better-sqlite3 provides production-grade SQLite** with clear migration path to PostgreSQL when needed
4. **Legislative data APIs universally use URL path versioning** (/api/v1/...) with 1-year deprecation windows
5. **Your current scraping stack (Playwright + RxJS + p-limit) aligns with 2025 best practices**—keep it

The ecosystem is mature enough that there are few unknowns. Most challenges are implementation details, not architectural risks.

---

## Key Findings

**Stack:** Hono (HTTP) + Drizzle ORM + better-sqlite3 + Bree (scheduling) + Zod (validation) + Playwright (scraping)

**Architecture:** Three-tier system: (1) Scheduled scraping jobs → (2) SQLite storage → (3) Public HTTP API with daily cache TTL

**Critical pitfall:** Government websites often have unpredictable availability and structure changes without notice. Build robust error handling, version detection, and schema validation from day one.

---

## Implications for Roadmap

Based on research, suggested phase structure:

### **Phase 1: Database Foundation (Week 1-2)**
**Rationale:** Database schema is the foundation. Get this right before building API.
- **Addresses:** Data persistence, query performance, schema management
- **Avoids:** Building API without proper data layer (leads to refactoring pain)
- **Key decisions:** Drizzle schemas for existing entities, migrations setup, indexes
- **Research flags:** None—Drizzle + SQLite migration is well-documented

### **Phase 2: HTTP API Layer (Week 2-3)**
**Rationale:** Once data is persisted, expose via HTTP API.
- **Addresses:** Public data access, versioning, caching, validation
- **Avoids:** Building API without versioning (breaking changes harm consumers)
- **Key decisions:** Hono routing, Zod validation, Cache-Control headers, OpenAPI docs
- **Research flags:** None—Hono + Zod pattern is standard

### **Phase 3: Job Scheduling (Week 3-4)**
**Rationale:** Automate daily data refresh after manual scraping is proven.
- **Addresses:** Daily updates, job isolation, error recovery
- **Avoids:** Running scrapers as one monolithic job (one crash kills all)
- **Key decisions:** Bree configuration, per-source jobs, retry strategies
- **Research flags:** None—Bree setup is straightforward

### **Phase 4: Expand Data Sources (Week 4+)**
**Rationale:** Add new scrapers (bills, amendments, commissions) incrementally.
- **Addresses:** Feature completeness, data richness
- **Avoids:** Scraping all sources before API is proven (wasted effort if requirements change)
- **Key decisions:** Schema extensions, scraper patterns, rate limiting per source
- **Research flags:** **YES—each new source may need source-specific research** (Spanish Congress site structure for bills/amendments is unknown)

### **Phase 5: Monitoring & Optimization (Ongoing)**
**Rationale:** Monitor API usage, query performance, scraping reliability.
- **Addresses:** Performance bottlenecks, error detection, capacity planning
- **Avoids:** Optimizing prematurely (wait for real usage data)
- **Key decisions:** Logging strategy, metrics, PostgreSQL migration triggers
- **Research flags:** None initially—monitor first, research specific problems

---

## Phase Ordering Rationale

**Why Database → API → Scheduling (not API → Database)?**
- Database schema defines data model. API should expose well-structured data, not retrofit API to messy schema later.
- Hono + Drizzle integration is seamless—easier to build API when database layer is stable.

**Why Scheduling after API?**
- Manual scraping is fine for initial testing. Automation adds complexity (job isolation, error handling).
- Prove API design with manually-refreshed data before automating refresh.

**Why Expand Sources last?**
- Each new source (bills, amendments) has unknown complexity. Your current scrapers (deputies, voting) prove the pattern works.
- Better to have high-quality API for 4 sources than buggy API for 10 sources.

---

## Research Flags for Phases

| Phase | Needs Research? | What to Research |
|-------|----------------|------------------|
| Phase 1: Database | **No** | Drizzle + SQLite is well-documented. Standard migration pattern. |
| Phase 2: API | **No** | Hono + Zod + OpenAPI pattern is standard. UK/EU Parliament APIs provide reference. |
| Phase 3: Scheduling | **No** | Bree setup is straightforward. Cron syntax is universal. |
| Phase 4: Expand Sources | **Yes (per source)** | Each new source requires: (1) Spanish Congress site structure analysis, (2) DOM selectors/API endpoints, (3) Data schema mapping, (4) Rate limiting rules. Research per source, not upfront. |
| Phase 5: Monitoring | **Maybe** | If performance issues arise (slow queries, high memory), research specific problem (e.g., "PostgreSQL full-text search for Spanish legislative data"). |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (HTTP/DB/Scheduling) | **HIGH** | Multiple 2025-2026 sources agree. Benchmarks confirm performance claims. Real-world usage (Hono in production, Drizzle adoption growing). |
| Features (API design) | **HIGH** | UK Parliament, Congress.gov, EU Parliament APIs provide reference architecture. URL path versioning is universal. Daily refresh is standard. |
| Architecture (three-tier) | **HIGH** | Scraping → Storage → API is proven pattern. Your current code already follows this (scrapers write to... somewhere, API reads from... somewhere). |
| Pitfalls (government data) | **MEDIUM-HIGH** | Generic government data pitfalls well-documented. Spanish Congress-specific pitfalls unknown (language: research needed for Phase 4). |
| Migration Path (SQLite → PostgreSQL) | **HIGH** | Well-trodden path. Drizzle abstracts differences. pgloader is battle-tested. |

**Overall confidence: HIGH**. The only unknowns are Spanish Congress-specific (site structure for new sources, rate limiting rules). Generic Node.js/TypeScript legislative data API is well-understood problem.

---

## Gaps to Address

### Known Gaps (Address Now)
1. **Spanish Congress rate limiting policy** - Unknown whether Congress site has official rate limits, robots.txt rules, or API usage guidelines. **Action:** Check https://www.congreso.es/robots.txt, look for developer documentation.

2. **Data license/terms of use** - Unknown whether Spanish Congress data is Open Data Licensed (like UK Parliament) or has restrictions. **Action:** Check https://www.congreso.es/ footer for terms, compare to UK Parliament's Open Parliament Licence.

3. **Data update frequency** - Assumption: daily refresh is sufficient. Unknown whether votes/speeches post in real-time during sessions. **Action:** Monitor Congress site during active session to understand update cadence.

### Unknown Gaps (Defer to Phase 4)
1. **Bills data structure** - How are bills represented on Congress site? PDF only, or structured HTML/JSON?
2. **Amendments linking** - How to link amendments to parent bills? Is there ID-based linking or text matching required?
3. **Commission data** - Are commission meetings published with structured data or just PDF minutes?
4. **Financial disclosures** - What format? PDF scraping required?

**Research strategy for Phase 4:** Tackle one source at a time. Research bills structure when implementing bills scraper, not upfront.

---

## Recommendations for Roadmap

### Immediate Actions (Before Phase 1)
1. **Verify Spanish Congress data license** - Confirm public data is reusable (likely yes, but verify)
2. **Check robots.txt and rate limiting** - Ensure scraping is permitted, understand limits
3. **Survey existing Spanish Congress API clients** - Search GitHub for "congreso españa API" to see if others have built similar tools (learn from their patterns)

### Short-Term (Phase 1-3)
1. **Start with Drizzle + better-sqlite3** - Replace sqlite3, define schemas, set up migrations
2. **Build Hono API with v1 prefix** - `/api/v1/deputies`, `/api/v1/voting`, etc.
3. **Add Cache-Control headers** - `max-age=86400` (24h) for all GET endpoints
4. **Automate daily refresh with Bree** - One job per source (isolation), cron schedule

### Long-Term (Phase 4+)
1. **Monitor API usage** - Track which endpoints are most used, optimize those
2. **Add full-text search** - When dataset grows, consider PostgreSQL with ts_vector for Spanish text search
3. **Consider GraphQL layer** - If API consumers need complex queries (e.g., "all votes by deputy X on bills tagged Y"), GraphQL over REST reduces over-fetching
4. **Add webhooks/SSE** - If real-time updates during sessions become requirement, add Server-Sent Events for live vote feeds

---

## Key Success Metrics

Track these to know when to scale/optimize:

| Metric | Current | Trigger for Action | Action |
|--------|---------|-------------------|--------|
| Database size | <10MB (estimated) | >1GB | Consider PostgreSQL migration |
| Daily scraping time | Unknown | >1 hour | Parallelize more, optimize scrapers |
| API response time (p95) | Unknown | >500ms | Add indexes, optimize queries, consider caching |
| API requests/day | 0 (no API yet) | >10K/day | Add CDN (Cloudflare), monitor costs |
| Scraping error rate | Unknown | >5% failures | Investigate Congress site changes, add alerts |

**Start measuring these in Phase 2** (when API is live).

---

## Comparison to Reference Implementations

| Feature | UK Parliament API | Congress.gov API | EU Parliament API | Your API (Recommended) |
|---------|------------------|------------------|-------------------|----------------------|
| **Versioning** | URL path (`/api/v1`) | Not versioned (legacy) | URL path (`/api/v1`) | URL path (`/api/v1`) ✓ |
| **Data format** | JSON | JSON + XML | JSON | JSON ✓ |
| **Caching** | Cache-Control headers | No caching headers | Cache-Control headers | Cache-Control (24h TTL) ✓ |
| **Documentation** | OpenAPI 3.x | Narrative docs | OpenAPI 3.x | OpenAPI 3.x ✓ |
| **Update frequency** | Real-time during sessions | Daily batch | Daily batch | Daily batch ✓ |
| **Rate limiting** | 300 req/min | Undocumented | 500 req/min | TBD (start with no limit, add if abused) |
| **Authentication** | None (public) | API key required | None (public) | None initially ✓ |

**Your design aligns with best practices from UK/EU Parliament APIs.** Congress.gov is older (2010s design) and less instructive.

---

## Ready for Roadmap

Research complete. Key findings:

1. **Technology stack is clear** - Hono, Drizzle, better-sqlite3, Bree, Zod, Playwright
2. **Architecture pattern is proven** - Three-tier (scraping → storage → API) used by all major legislative APIs
3. **Phase structure is logical** - Database → API → Scheduling → Expand Sources
4. **Unknowns are manageable** - Spanish Congress-specific details defer to Phase 4
5. **Success metrics defined** - Database size, scraping time, API response time, request volume, error rate

**No blockers to proceeding with roadmap creation.**

---

## Sources

All sources listed in STACK.md, plus:
- [UK Parliament Developer Hub](https://developer.parliament.uk/)
- [Congress.gov API Documentation](https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/)
- [European Parliament Open Data Portal](https://data.europarl.europa.eu/en/developer-corner/opendata-api)
- [Legislative Data Handbook](https://cis.pubpub.org/pub/legislative-data/release/7)

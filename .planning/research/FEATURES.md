# Feature Landscape: Legislative Data APIs

**Domain:** Congress/Parliamentary Open Data APIs
**Researched:** 2026-01-21
**Project Context:** Spanish Congress Open Data API for researchers and journalists

## Executive Summary

Legislative data APIs serve researchers, journalists, and civic tech developers who need programmatic access to parliamentary information. After analyzing major platforms (Congress.gov, OpenStates, LegiScan, UK Parliament, European Parliament, Canadian Parliament), a clear feature hierarchy emerges:

**Table stakes** are structured data access, filtering by basic metadata (date, chamber, person), JSON export, and individual entity retrieval. Missing these makes the API feel incomplete.

**Differentiators** include full-text search across bill content, relationship mapping (sponsors/cosponsors, committee memberships), historical trend analysis, and bulk download options. These elevate the API from "data dump" to "research tool."

**Anti-features** to avoid in v1: complex authentication (public data should be open), GraphQL complexity (REST is sufficient), real-time webhooks (daily refresh meets user needs), and over-normalized APIs that require dozens of requests to answer simple questions.

## Table Stakes

Features users expect from any legislative data API. Missing these = product feels incomplete or frustrating.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **JSON response format** | Industry standard for APIs | Low | XML also common but JSON is primary. Congress.gov, OpenStates, LegiScan all default to JSON. |
| **Entity-level retrieval** | Basic CRUD pattern | Low | GET /deputies/:id, GET /bills/:id, GET /votes/:id. Users expect to fetch individual entities. |
| **List endpoints with pagination** | Browse collections | Low | Default 20 results, max 250 (Congress.gov standard). Offset or cursor-based. |
| **Date range filtering** | Most common query pattern | Low | Filter by vote date, bill introduction date, session date. Researchers always segment by time. |
| **Chamber/legislature filtering** | Basic organizational filter | Low | Filter by Senate vs House, by legislature number (14th, 15th). Critical for Spanish Congress. |
| **Person/deputy filtering** | Track individual legislators | Low | Filter votes by deputy, bills by sponsor. Core use case for journalist profiles. |
| **API key requirement** | Rate limit protection | Low | Free tier with reasonable limits (5,000/hour Congress.gov, 30,000/month LegiScan). Protects service. |
| **Rate limiting (5,000-10,000/hour)** | Service stability | Low | Standard across Congress.gov, historic ProPublica API. Prevents abuse. |
| **CSV export option** | Non-developer users | Medium | Researchers often want CSV for Excel/R/Python analysis. LegiScan provides this. |
| **Error messages with HTTP codes** | Developer experience | Low | Proper 404, 400, 429, 500 responses with explanatory messages. |
| **Voting record detail** | Core legislative data | Medium | Individual deputy position (Yes/No/Abstain/NoVote), vote totals, vote metadata. Already implemented. |
| **Bill metadata** | Core legislative data | Medium | Title, description, status, sponsors, dates. Essential for bill tracking. |
| **Deputy/member profiles** | Core legislative data | Low | Name, party, district, seat number, current status. Already implemented. |
| **API documentation** | Adoption requirement | Medium | Clear endpoint list, parameter descriptions, example responses. Congress.gov has excellent docs. |

**MVP Priority:** All table stakes features should be in v1. These are baseline expectations.

## Differentiators

Features that set your API apart from basic data dumps. Not expected by default, but highly valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Full-text search across bill content** | Find bills by topic/keyword | High | LegiScan's killer feature: search 175,000 bills by full text with proximity operators. Requires indexed storage. |
| **Cross-entity relationship queries** | Answer "Who voted with whom?" | High | Map sponsor/cosponsor networks, committee co-membership, voting alignment. Requires graph-like queries. |
| **Bulk download/archive access** | Researchers doing large-scale analysis | Medium | LegiScan provides historical archives as JSON/XML/CSV downloads. Alternative to pagination hell. |
| **Multi-session historical data** | Trend analysis across legislatures | Medium | OpenStates covers all 50 states historically. Compare 14th vs 15th legislature. Valuable for research. |
| **Committee membership & activity** | Understand power structures | Medium | Track who sits on which committees, committee hearing data. ProPublica included this before shutdown. |
| **Amendment tracking** | Understand bill evolution | High | Map amendments to original bills, track amendment sponsors/votes. Complex relational data. |
| **Vote comparison endpoints** | Compare legislator positions | Medium | ProPublica had "compare two members" endpoint showing % agreement. Useful for journalist analysis. |
| **Filtering by multiple criteria** | Complex queries in one request | Medium | Filter votes by date range + chamber + deputy + topic simultaneously. Reduces API call volume. |
| **Sorting options** | User control over result order | Low | Sort by date (asc/desc), relevance (for search), vote count. OpenParliament.ca supports this. |
| **Field selection/sparse fieldsets** | Reduce payload size | Medium | GraphQL-style field selection in REST (e.g., ?fields=name,party). Improves performance. |
| **Related entity embedding** | Reduce round-trip requests | Medium | Include deputy details in vote response without separate request. Denormalization for convenience. |
| **Statistics/aggregation endpoints** | Pre-computed analytics | High | Total votes by party, attendance rates, bill success rates. Save researchers from computing themselves. |
| **Advanced search operators** | Power user queries | High | Boolean operators (AND/OR/NOT), proximity search, phrase matching. LegiScan's full-text search supports this. |
| **Change detection/diffs** | Track what's updated | Medium | Return only new/changed records since last fetch. Already partially implemented in codebase. |
| **Session/legislature metadata** | Context for data | Low | Dates of sessions, active vs historical legislatures, session types. Helps users understand context. |

**MVP Recommendation:**
- **Include:** Bulk download (medium complexity, high value), historical multi-session data (already collecting), sorting options (low complexity).
- **Defer to v2:** Full-text search (requires search index), relationship queries (complex), aggregation endpoints (after data volume validates need).

## Anti-Features

Features to explicitly NOT build in v1. Common mistakes or premature optimizations.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **User authentication/authorization** | Public data doesn't need login | Use API keys for rate limiting only, no user accounts. Congress.gov model: free API key via data.gov, no login. |
| **GraphQL endpoint** | Adds complexity without proven need | Stick with REST. GraphQL shines with complex client needs, but adds backend complexity and caching challenges. Can add later if demand exists. |
| **Real-time webhooks/notifications** | Daily refresh cadence is sufficient | Provide change detection endpoint for polling. Congressional data updates daily, not real-time. Over-engineering. |
| **Complex query language** | Learning curve barriers | Use standard query params (?date_from=2024-01-01). UK Parliament's SPARQL endpoint is powerful but intimidating for non-experts. |
| **Versioned API (v1, v2) on day 1** | Premature optimization | Build backwards-compatible API, add versioning when breaking changes needed. Most successful APIs (Stripe) maintain compatibility. |
| **Streaming/pagination beyond 10,000 results** | Deep pagination kills performance | Congress.gov limits deep paging at 100,000 results. For bulk needs, provide download endpoint instead. |
| **Embedded data visualization** | API is data layer, not presentation | Return data in structured format. Let clients build viz. Separation of concerns. |
| **Write endpoints (POST/PUT/DELETE)** | Read-only data source | Congressional data is scraped, not user-generated. API is read-only mirror. |
| **OAuth/JWT complexity** | Overkill for public API | Simple API key in header (X-API-Key) is sufficient. Congress.gov, OpenStates, LegiScan all use this model. |
| **Over-normalized responses** | Forces N+1 query problem | Include essential related data in responses (deputy name in vote record). Denormalize for API performance. Already doing this in voting.ts. |
| **Multiple export formats** | Maintenance burden | JSON + CSV covers 95% of needs. XML, RDF, Turtle nice-to-have but low ROI. European Parliament supports 10+ formats, probably overkill. |
| **Natural language query interface** | AI hype, not proven need | Standard filters cover user needs. EU Parliament experimenting with NLP→SPARQL but adds complexity. Wait for demand. |

**Philosophy:** Build the simplest API that solves user problems. Can always add complexity later; removing it is much harder.

## Feature Dependencies

Understanding how features build on each other:

```
Foundation Layer (Must build first):
  ├─ Entity retrieval (GET /deputies/:id)
  ├─ List endpoints (GET /deputies)
  ├─ Pagination (offset/limit)
  └─ JSON responses

Query Layer (Build second):
  ├─ Date filtering (depends on: Foundation)
  ├─ Chamber/legislature filtering (depends on: Foundation)
  ├─ Person filtering (depends on: Foundation)
  ├─ Multi-criteria filtering (depends on: all single filters)
  └─ Sorting (depends on: List endpoints)

Export Layer (Build third):
  ├─ CSV export (depends on: Query layer)
  └─ Bulk download (depends on: Query layer)

Advanced Layer (Build last):
  ├─ Full-text search (depends on: Foundation, requires search index)
  ├─ Relationship queries (depends on: Foundation, requires graph data)
  ├─ Aggregations (depends on: Query layer, requires compute)
  └─ Change detection (depends on: Foundation, already partially implemented)
```

**Critical Path:** Foundation → Query → Export is MVP. Advanced features are post-MVP enhancements.

## Feature Categorization by Data Entity

How features apply to each data type in your system:

### Deputies/Members
**Table Stakes:**
- List all deputies with pagination
- Get deputy by ID
- Filter by party/group
- Filter by legislature
- Export to CSV

**Differentiators:**
- Historical deputy data (past legislatures)
- Committee memberships
- Voting statistics (attendance, alignment)
- Sponsorship history

### Voting Records
**Table Stakes:** (Already implemented)
- List votes with pagination
- Get vote by ID (legislature + session + number)
- Filter by date range
- Filter by deputy
- Filter by chamber/legislature
- Individual deputy positions in vote
- Vote totals (for/against/abstain)

**Differentiators:**
- Full-text search in vote titles/descriptions
- Filter by vote outcome (passed/failed)
- Vote comparison (deputy A vs deputy B)
- Party alignment statistics

### Bills & Legislation
**Table Stakes:** (Not yet implemented)
- List bills with pagination
- Get bill by ID
- Filter by date (introduction, last action)
- Filter by sponsor
- Filter by status (introduced, committee, passed, etc.)
- Bill metadata (title, summary, dates)

**Differentiators:**
- Full-text search in bill content
- Amendment tracking
- Cosponsor relationships
- Committee referrals
- Related bills

### Speeches/Interventions
**Table Stakes:** (Already implemented at scraping layer)
- List speeches with pagination
- Get speech by ID
- Filter by deputy
- Filter by date/session

**Differentiators:**
- Full-text search in speech content
- Topic/subject tagging
- Debate context (what bill/topic)

### Committees & Commissions
**Table Stakes:** (Not yet implemented)
- List committees
- Get committee by ID
- Committee membership roster
- Filter members by committee

**Differentiators:**
- Committee activity timeline
- Hearing schedules
- Bills referred to committee
- Member tenure on committees

### Bureau/Leadership
**Table Stakes:** (Already implemented at scraping layer)
- List bureau members
- Filter by role
- Current vs historical

**Differentiators:**
- Leadership change timeline
- Power structure analysis

## Search & Query Patterns

Based on real-world usage from established APIs:

### By Researchers
1. **Voting alignment studies**: "Get all votes by deputy X in legislature Y, compare with deputy Z"
2. **Temporal analysis**: "Track voting patterns over time, by session or year"
3. **Bulk export**: "Download all votes from 14th legislature for offline analysis"
4. **Bill progression**: "Find all bills sponsored by party X that passed"
5. **Attendance patterns**: "Calculate deputy attendance rates by session"

**API Features Needed:**
- Multi-criteria filtering (deputy + date range + chamber)
- Bulk download option
- Vote comparison endpoints
- Historical data access
- Aggregation/statistics endpoints (nice-to-have)

### By Journalists
1. **Deputy profiles**: "What did deputy X vote on this month?"
2. **Bill tracking**: "What's the status of bill Y, who sponsored it, what amendments exist?"
3. **Breaking news**: "What votes happened today, what passed/failed?"
4. **Investigation**: "Find all votes on topic Z, who voted how?"
5. **Trend stories**: "Compare this legislature vs last legislature on metric M"

**API Features Needed:**
- Recent activity filtering (last 7 days, last 30 days)
- Person-centric queries (filter by deputy)
- Full-text search (find bills by topic keyword)
- Status filtering (active bills, recent votes)
- Change detection (what's new since yesterday)

### By Civic Tech Developers
1. **Build deputy scorecards**: Aggregate voting data per person
2. **Bill alerts**: Notify users when bill status changes
3. **Voting visualizations**: Map votes to constituencies
4. **Comparative tools**: "Who votes like me?" based on positions

**API Features Needed:**
- Comprehensive entity relationships
- Consistent ID schemes for linking
- Change detection for incremental updates
- Flexible filtering for custom logic
- Reasonable rate limits for apps serving users

## Export Formats & Access Patterns

| Format | Use Case | Complexity | Priority |
|--------|----------|------------|----------|
| **JSON** | API responses, developer integration | Low | MVP |
| **CSV** | Excel analysis, non-developers | Low | MVP |
| **Bulk JSON archives** | Large-scale research, data science | Medium | MVP |
| **XML** | Legacy systems, government compatibility | Low | Post-MVP |
| **RDF/Linked Data** | Semantic web, academic research | High | Out of scope |

**Rate Limit Tiers (based on industry standards):**

| Tier | Limit | Use Case | Implementation |
|------|-------|----------|----------------|
| **Public (no key)** | 100/hour | Casual browsing, demos | Simple IP-based throttle |
| **Free API key** | 5,000/hour | Researchers, journalists, developers | Congress.gov model |
| **Bulk download** | Daily/weekly refresh | Data science, archival | Pre-generated files, bypass API |

**Pagination Standards:**
- Default: 20 results (Congress.gov, historic ProPublica)
- Max per page: 250 results (Congress.gov standard)
- Deep pagination limit: 10,000 results (beyond this, use bulk download)
- Cursor vs offset: Offset is simpler, cursor is more robust. Start with offset.

## MVP Recommendation

Based on current project state (deputies, votes, speeches, bureau already scraped) and research findings:

### Phase 1: Foundation API (Weeks 1-2)
**Table stakes to ship:**
1. REST API with JSON responses
2. Entity endpoints: GET /deputies, /votes, /speeches, /bureau
3. Individual entity: GET /deputies/:id, /votes/:legislature/:session/:number
4. Basic filtering: date range, legislature, deputy, chamber
5. Pagination: offset-based, default 20, max 250
6. CSV export for all endpoints
7. API key + rate limiting (5,000/hour)
8. API documentation (OpenAPI/Swagger)

**Defer to later:**
- Bills/amendments (not yet scraped)
- Committees (not yet scraped)
- Full-text search (requires indexing)
- Bulk downloads (can manually export from SQLite initially)

### Phase 2: Query Enhancement (Weeks 3-4)
**Add differentiators:**
1. Multi-criteria filtering (combine date + deputy + chamber)
2. Sorting options (by date, by name)
3. Bulk download archives (pre-generated JSON/CSV per legislature)
4. Change detection endpoint (leverage existing partial implementation)
5. Related entity embedding (include deputy details in vote response)

**Defer to later:**
- Relationship queries
- Aggregation endpoints
- Advanced search

### Phase 3: Search & Discovery (Month 2+)
**Power user features:**
1. Full-text search in bills (when bill scraping implemented)
2. Search in vote titles/descriptions
3. Sponsor/cosponsor relationship mapping
4. Committee activity tracking
5. Statistical aggregations (voting patterns, attendance)

**Requirements:**
- Search index (Elasticsearch/MeiliSearch or SQLite FTS)
- Graph relationship data
- Analytics compute layer

## Open Questions & Unknowns

Areas where research was inconclusive or needs validation:

1. **Spanish Parliament API examples**: Found mostly US/UK/EU examples. Didn't find Spanish parliamentary API for comparison. Assuming patterns transfer but may have country-specific expectations.

2. **Researcher vs journalist split**: Research shows both groups use these APIs, but specific feature preferences by group unclear. May need user interviews.

3. **Optimal bulk download granularity**: Should archives be per-legislature, per-session, per-month, or all-time? LegiScan does per-session. Depends on data volume.

4. **Search technology choice**: Full-text search could use SQLite FTS5, PostgreSQL full-text, or dedicated engine (MeiliSearch, Elasticsearch). Each has tradeoffs. Needs separate research.

5. **API versioning strategy**: When to introduce /v1/? Most successful APIs avoid versioning initially, maintain backwards compatibility. But need clear policy for when breaking changes are necessary.

6. **Authentication for future paid tier**: Free tier likely sufficient initially, but if service scales, may need paid tier for higher limits. Auth strategy deferred.

## Confidence Assessment

| Feature Category | Confidence | Source Quality |
|-----------------|------------|----------------|
| Table stakes (entity retrieval, filtering, pagination) | **HIGH** | Verified across Congress.gov, OpenStates, LegiScan, UK Parliament docs |
| Export formats (JSON, CSV) | **HIGH** | Consistent across all major legislative APIs |
| Rate limiting standards | **HIGH** | Congress.gov (5K/hour), LegiScan (30K/month) well-documented |
| Search/query patterns | **MEDIUM** | Inferred from API features and secondary sources about researcher/journalist needs |
| Differentiators (relationship queries, aggregations) | **MEDIUM** | ProPublica had these (now sunset), mentioned in various API docs |
| Anti-features (what to avoid) | **MEDIUM** | Based on general API best practices (2026 sources) + legislative API observations |
| Spanish-specific expectations | **LOW** | Research focused on US/UK/EU, minimal Spain-specific legislative API examples |

## Sources

### Legislative Data APIs
- [Congress.gov API](https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/)
- [Open States API v3 Overview](https://docs.openstates.org/api-v3/)
- [LegiScan API](https://legiscan.com/legiscan)
- [ProPublica Congress API](https://projects.propublica.org/api-docs/congress-api/) (historical reference, no longer available)
- [European Parliament Open Data API](https://data.europarl.europa.eu/en/developer-corner/opendata-api)
- [UK Parliament Developer Hub](https://developer.parliament.uk/)
- [OpenParliament.ca API](https://openparliament.ca/api/)

### API Features & Usage
- [Introducing House Roll Call Votes in Congress.gov API](https://blogs.loc.gov/law/2025/05/introducing-house-roll-call-votes-in-the-congress-gov-api/)
- [LegiScan Full Text Search](https://legiscan.com/fulltext-search)
- [Congress.gov Advanced Search](https://www.congress.gov/help/advanced-search-legislation-form)
- [GovTrack.us About Our Data](https://www.govtrack.us/about-our-data)

### API Best Practices (2026)
- [API Pagination Best Practices 2026](https://www.merge.dev/blog/api-pagination-best-practices)
- [API Versioning Best Practices 2026](https://getlate.dev/blog/api-versioning-best-practices)
- [API Backwards Compatibility](https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices)
- [GraphQL vs REST 2026](https://www.f22labs.com/blogs/graphql-vs-rest-apis-key-differences-2025/)
- [API Design Anti-Patterns](https://blog.xapihub.io/2024/06/19/API-Design-Anti-patterns.html)

### Legislative Data Research
- [Democratising Legislative Data](https://library.bussola-tech.co/p/democratising-legislative-data-an)
- [Working with US Congress Bill Sponsorship Data](https://cran.r-project.org/web/packages/incidentally/vignettes/congress.html)
- [FOSDEM 2026: Keeping Legislative Data Accessible](https://fosdem.org/2026/schedule/event/BJKRCN-keeping_legislative_data_accessible/)

---

**Research completed:** 2026-01-21
**Next step:** Use this feature landscape to scope requirements for bills/amendments/commissions expansion.

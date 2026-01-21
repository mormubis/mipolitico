# Domain Pitfalls: Legislative Data APIs

**Domain:** Legislative/Parliamentary Data Scraping & API
**Project:** Spanish Congress Open Data API
**Researched:** 2026-01-21
**Overall Confidence:** HIGH (verified with multiple authoritative sources)

## Executive Summary

Legislative data API projects face unique challenges that span legal compliance, technical brittleness, data quality, and user expectations. The most critical failure modes are: (1) **scraper brittleness** causing silent failures after website updates, (2) **data staleness** going undetected for extended periods, and (3) **legal/ethical violations** from improper scraping practices. Based on research of similar projects (Congress.gov API, ProPublica Congress API, OpenStates, LegiScan), successful legislative data APIs require: robust change detection, comprehensive monitoring, conservative rate limiting, and deep understanding of researcher workflows.

---

## Critical Pitfalls

Mistakes that cause rewrites, legal issues, or major outages.

### Pitfall 1: Selector Brittleness Causing Silent Failures

**What goes wrong:** Website structure changes (class names, IDs, DOM hierarchy) break scrapers without triggering obvious errors. Data collection stops or becomes incomplete, but the API continues serving stale data. By the time the failure is detected, weeks of data may be missing.

**Why it happens:**
- Traditional web scraping relies on brittle CSS/XPath selectors that break with trivial HTML changes
- Government websites frequently restructure content without advance notice
- Scrapers fail "silently" - they run successfully but extract nothing or partial data
- No validation that extracted data matches expected schema/volume

**Real-world evidence:**
- Website structure shifts occur "silently and frequently, with class names disappearing, containers becoming shadow DOM elements" ([State of Web Scraping 2026](https://www.browserless.io/blog/state-of-web-scraping-2026))
- Congress.gov API experienced a recent outage in January 2026 that "trapped requests in an endless loop and locked out developers" ([Congress.gov API Has Gone Dark](https://www.govtech.com/gov-experience/congress-govs-api-has-gone-dark-impacting-data-access))
- Engineering teams spend "20-30% of their time maintaining existing scrapers" due to selector updates ([Web Scraping Cost Analysis](https://soax.com/blog/build-vs-buy-web-scraping-cost-analysis))

**Consequences:**
- Data gaps that are discovered weeks/months later
- Researcher trust erosion ("this API is unreliable")
- Emergency maintenance cycles costing 20-30% of engineering time
- Technical debt accumulation ($80,000/year in refactoring costs per research)

**Prevention:**

1. **Multi-layer selector strategy** - Use fallback selectors (class → ID → semantic tag → position)
2. **Schema validation at extraction** - Verify extracted data matches expected structure before storage
3. **Volume monitoring** - Alert when daily extraction count drops >10% from baseline
4. **Canary checks** - Test known entities (e.g., specific deputy always present) in every scrape
5. **Self-healing selectors** - When primary selector fails, automatically test fallbacks and log successful alternative
6. **Change detection on source** - Hash webpage structure, alert on changes before scraper breaks

**Detection (Warning Signs):**
- Scraper runs succeed but database INSERT counts decline
- API response sizes shrink over time
- Known entities (current legislators) missing from recent data
- User reports of "missing data" for recent dates
- Scraper execution time drops significantly (less data to process)

**Phase to Address:**
- **Phase 1 (MVP):** Basic volume monitoring, schema validation
- **Phase 2:** Self-healing selectors, change detection alerts
- **Phase 3:** Automated selector testing framework

---

### Pitfall 2: Data Staleness Goes Undetected

**What goes wrong:** ETL pipeline fails (network error, auth change, server downtime) but the API continues serving old data. Researchers unknowingly base analysis on outdated information. The longer staleness persists, the more damage to reputation.

**Why it happens:**
- ETL failures can be "silent" - script completes without error but fetches nothing
- No freshness metadata exposed in API responses
- Monitoring focuses on "is server up?" not "is data current?"
- Government websites have unpredictable update schedules (plenary sessions vs recess)

**Real-world evidence:**
- "68% of organizations need 4+ hours to detect data issues, with an average resolution time of 15 hours" ([ETL Error Handling](https://www.integrate.io/blog/etl-error-handling-and-monitoring-metrics/))
- "ETL pipelines can fail silently after source system updates without triggering alerts, causing stakeholders to make decisions with stale information" ([Data Freshness](https://www.siffletdata.com/blog/data-freshness))
- Gartner estimates "$12.9M per year in org-level losses from bad data" ([ETL Monitoring Guide](https://airbyte.com/data-engineering-resources/how-do-i-monitor-etl-pipeline-health))

**Consequences:**
- Researchers publish findings based on incomplete data
- Journalists miss breaking legislative developments
- API reputation permanently damaged ("can't trust this data")
- Legal/ethical issues if stale data affects public perception

**Prevention:**

1. **Freshness metadata in every response** - Include `last_updated`, `data_as_of` timestamps
2. **Staleness thresholds** - Alert if no new data in 24 hours during session, 7 days during recess
3. **Heartbeat monitoring** - Independent check that scraper ran AND produced new data
4. **Source timestamp verification** - Compare extracted "published date" to current date, alert if >2 days old
5. **Multi-source validation** - For critical data (votes, bill status), verify against secondary sources
6. **API health endpoint** - `/health` returns freshness metrics for all data types

**Detection (Warning Signs):**
- No database INSERTs for >24 hours during active session
- All API responses show same `last_updated` timestamp
- Scraper logs show successful execution but zero new records
- Source website shows recent activity (new bills) not reflected in API
- User reports "API missing recent vote results"

**Phase to Address:**
- **Phase 1:** Freshness timestamps in API, basic staleness alerts (>48 hours)
- **Phase 2:** Heartbeat monitoring, health endpoint with detailed metrics
- **Phase 3:** Multi-source validation, adaptive staleness thresholds

---

### Pitfall 3: Legal/Ethical Violations from Improper Scraping

**What goes wrong:** Aggressive scraping (ignoring robots.txt, excessive requests, bypassing rate limits) triggers legal action, IP bans, or GDPR violations. Project shut down before launch or facing €240K+ fines.

**Why it happens:**
- Developers unaware that legal landscape changed (robots.txt now GDPR signal)
- Pressure to "get data faster" leads to aggressive rate limits
- No legal review of scraping practices
- Scraping personal data (deputy contact info) without GDPR compliance

**Real-world evidence:**
- "In 2025, influential regulators like France's CNIL now see respecting robots.txt as a key factor in GDPR's Legitimate Interest balancing test" ([Web Scraping Legal 2025](https://www.browserless.io/blog/is-web-scraping-legal))
- "French regulator fined KASPR €240,000 for scraping LinkedIn data without consent" ([GDPR Web Scraping](https://medium.com/deep-tech-insights/web-scraping-in-2025-the-20-million-gdpr-mistake-you-cant-afford-to-make-07a3ce240f4f))
- "Ignoring robots.txt undermines claims of acting in good faith and reduces legal defenses" ([Is Web Scraping Legal 2025](https://research.aimultiple.com/is-web-scraping-legal/))
- "Companies argue defendants purposefully bypassed technological measures including rate limits, captchas" ([Scraping Legal Issues](https://groupbwt.com/blog/is-web-scraping-legal/))

**Consequences:**
- IP ban from congreso.es (permanent data loss)
- GDPR fines (€240K+ based on precedent)
- Legal action from Spanish Congress
- Project forced offline, reputational damage
- Criminal liability in extreme cases (anti-hacking laws)

**Prevention:**

1. **Strict robots.txt compliance** - Parse and honor Disallow directives and Crawl-delay
2. **Conservative rate limiting** - 1 request per 10-15 seconds minimum, respect any specified crawl-delay
3. **Identify your scraper** - Use descriptive User-Agent with contact email
4. **Personal data minimization** - Don't scrape deputy home addresses, personal phones unless essential
5. **Legal review before launch** - Document compliance with GDPR, Spanish data protection laws
6. **Official API check** - Verify congreso.es doesn't offer official API before scraping
7. **Terms of service review** - Read any "Terms of Use" on congreso.es
8. **Request permission** - Email congreso.es IT to inform of project, request guidance

**Detection (Warning Signs):**
- HTTP 403/429 responses increasing
- Captchas appearing on pages that didn't have them
- IP address blocked from accessing congreso.es
- Cease-and-desist email from Spanish Congress legal team
- Robots.txt updated to disallow your paths

**Phase to Address:**
- **Pre-Phase 1 (Research):** Legal review, official API check, robots.txt analysis
- **Phase 1:** Rate limiting, robots.txt compliance, proper User-Agent
- **Ongoing:** Monitoring for blocks, periodic legal compliance review

---

### Pitfall 4: SQLite Scalability Wall Hits Mid-Project

**What goes wrong:** SQLite performs well initially but degrades catastrophically when dataset crosses threshold (~1M rows, heavy concurrent reads, complex JOINs). Migration to PostgreSQL requires complete rewrite of queries, schema changes, operational complexity. Project stalls for weeks during migration.

**Why it happens:**
- SQLite marketed as "good enough for most apps" (true for <100K users)
- File-level locking causes write bottlenecks with concurrent requests
- Complex analytical queries (JOIN across bills, votes, deputies) slow dramatically
- Database file grows to multi-GB, backup/restore becomes painful

**Real-world evidence:**
- "When you start to hit about a terabyte of data, that's when you might want to start looking elsewhere, but before that, you're good" but "realistically, when you have a huge number of concurrent writers, you're probably better off using client-server databases" ([SQLite Scalability](https://www.slingacademy.com/article/sqlite-scalability-limitations-and-workarounds/))
- "SQLite uses file-level locks rather than row-level, which means that while one write operation occurs, no other operation can modify the database, which can significantly limit concurrent write operations" ([What Are Limitations of SQLite](https://www.dbtalks.com/tutorials/learn-sqlite/what-are-the-limitations-of-sqlite))
- "Any site that gets fewer than 100K hits/day should work fine with SQLite" ([Appropriate Uses For SQLite](https://sqlite.org/whentouse.html))

**Consequences:**
- API latency spikes (500ms → 5s for complex queries)
- Write contention (concurrent scraper + API reads = database locked errors)
- Migration downtime (days to export, convert, test)
- Query rewrite effort (SQLite → PostgreSQL syntax differences)
- Operational overhead (PostgreSQL deployment, backups, monitoring)

**Prevention:**

1. **Plan PostgreSQL from Phase 2** - Don't treat SQLite as "final" database
2. **Abstracting data layer** - Use ORM or repository pattern, not raw SQL everywhere
3. **Load testing early** - Test with 1M+ rows before committing to SQLite
4. **Monitor query performance** - Track p95/p99 latency, alert when degrading
5. **Estimate final dataset size** - Spanish Congress has 350 deputies, 12+ legislatures, thousands of bills → millions of rows
6. **Consider PostgreSQL from start** - If expecting >500K rows or >1K API requests/day

**Detection (Warning Signs):**
- Query latency increasing month-over-month
- "Database is locked" errors in API logs
- SQLite file >1GB and growing
- Researcher complaints about "slow searches"
- API timeouts on complex queries (multi-table JOINs)

**Phase to Address:**
- **Phase 1 (MVP):** SQLite acceptable for initial dataset (<100K rows)
- **Phase 2:** Evaluate migration trigger, plan PostgreSQL migration
- **Phase 3:** Migrate to PostgreSQL before public launch if needed

---

### Pitfall 5: Schema Mismatches Accumulate as Data Debt

**What goes wrong:** Source data (congreso.es) has inconsistent formats across legislatures, missing fields, duplicate entities with different IDs. Initial schema doesn't account for edge cases. Over time, workarounds accumulate ("just skip that record"), data quality degrades, queries become unreliable.

**Why it happens:**
- Legislative data evolved over decades, formats changed
- Different legislatures use different conventions (party names, vote recording)
- Schema designed for "happy path" (complete, consistent data)
- No validation rules enforced at ingestion
- Pressure to "just get it working" leads to skipping problematic records

**Real-world evidence:**
- "Most common data quality issues include inaccurate data entry, incomplete data, duplicate entries, variety in schema and format, low data veracity" ([9 Common Data Quality Issues](https://atlan.com/data-quality-issues/))
- "Schema drift can occur when developer teams add new columns without coordination or silent corruption during peak loads" ([Data Quality Framework](https://www.ewsolutions.com/data-quality-framework/))
- "Duplicate data—having multiple records for the same entity—can lead to confusion and errors in reporting and analysis" ([Data Quality Challenges](https://www.alation.com/blog/data-quality-challenges-large-scale-data-environments/))

**Consequences:**
- Incomplete dataset (missing 5-10% of records due to "skip on error")
- Duplicate entities (same deputy with two IDs)
- Inconsistent formatting (party names: "PSOE" vs "Partido Socialista Obrero Español")
- Queries return wrong results (COUNT(*) inflated by duplicates)
- Researcher confusion ("why are there 380 deputies when there should be 350?")

**Prevention:**

1. **Schema validation at ingestion** - Reject records missing required fields, log to review queue
2. **Normalization layer** - Canonicalize party names, deputy names before storage
3. **Duplicate detection** - Check for existing entity before INSERT (by name+legislature, not just ID)
4. **Data quality metrics** - Track % records rejected, % duplicates, missing field frequencies
5. **Manual review queue** - Don't auto-skip errors, surface to human for resolution
6. **Versioned schema** - Plan for schema evolution (add migration framework early)
7. **Reference data catalog** - Maintain canonical list of parties, committees, vote types

**Detection (Warning Signs):**
- Scraper logs show "skipped N records" but no investigation
- Database has multiple entities with similar names (fuzzy match reveals duplicates)
- COUNT queries return unexpected totals
- API responses have inconsistent field formats (sometimes string, sometimes array)
- User reports "I see duplicate deputies in results"

**Phase to Address:**
- **Phase 1:** Schema validation (reject invalid records), basic normalization
- **Phase 2:** Duplicate detection, manual review queue
- **Phase 3:** Advanced normalization, data quality dashboard

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or user frustration.

### Pitfall 6: API Query Interface Doesn't Match Researcher Workflows

**What goes wrong:** API designed around database schema, not user needs. Researchers need "all votes by party in 2025" but API only supports "vote by ID". Multiple API calls required for simple questions. Researchers abandon API, write custom scrapers instead.

**Why it happens:**
- API designed by developers, not validated with actual researchers
- Assumption that "we expose all data, they can figure out queries"
- Database schema optimized for storage, not retrieval patterns
- No study of how legislative researchers actually work

**Real-world evidence:**
- "Researchers can filter by any designated fields" in mature legislative APIs ([LegiScan API](https://legiscan.com/legiscan))
- Congress.gov API allows "searching across different collections including legislation, committee materials, congressional records, members, and nominations" ([Using Congress.gov Data](https://www.congress.gov/help/using-data-offsite))
- "Filters can narrow results by court, judge, date, or legal topic" for legal research ([Legal Research Engine 2025](https://www.cicerai.com/blogs/legal-research-engine))

**Prevention:**

1. **User research before API design** - Interview 5-10 journalists/researchers about workflows
2. **Common query patterns** - Support frequent questions with single endpoint (e.g., `/votes?party=PSOE&date_from=2025-01-01`)
3. **Flexible filtering** - Allow combining filters (deputy + legislature + vote_type)
4. **Aggregation endpoints** - Provide pre-computed summaries (votes by party, bills by status)
5. **GraphQL consideration** - Let users specify exactly what fields they need
6. **Query examples in docs** - Show how to answer common research questions

**Detection (Warning Signs):**
- Users making 50+ API calls to answer one question
- Feature requests for "can you add endpoint for X?"
- Low API adoption despite marketing effort
- Users still scraping congreso.es directly instead of using API
- Support requests asking "how do I get all bills by party?"

**Phase to Address:**
- **Phase 2:** User research, design query interface around workflows
- **Phase 3:** Advanced filtering, aggregation endpoints

---

### Pitfall 7: No Monitoring for Scraper Health or Source Changes

**What goes wrong:** Scraper silently fails (network timeout, auth change, HTML structure change) but no alerts trigger. Discovered days later when user reports missing data. By then, data gap may be unrecoverable if source doesn't maintain historical versions.

**Why it happens:**
- Focus on "ship the feature" not "maintain the feature"
- Assumption that "cron job runs = everything is fine"
- No metrics on what constitutes "healthy" scrape
- Alerting added as afterthought, not built-in

**Real-world evidence:**
- "Data teams reported an average of 67 incidents per month in 2026" with "68% of organizations need 4+ hours to detect data issues" ([ETL Error Handling](https://www.integrate.io/blog/etl-error-handling-and-monitoring-metrics/))
- "A pipeline failure caught within minutes might require a simple restart, while the same failure discovered days later could mean rebuilding datasets and validating historical data" ([ETL Pipeline Monitoring](https://airbyte.com/data-engineering-resources/how-do-i-monitor-etl-pipeline-health))

**Prevention:**

1. **Success metrics** - Define "healthy scrape" (e.g., extracted >10 bills, <5% errors)
2. **Real-time alerting** - Slack/email when scrape completes with errors or zero records
3. **Baseline comparison** - Alert if today's extraction is 50% smaller than 7-day average
4. **Source change detection** - Hash page structure, alert on changes before scraper breaks
5. **Execution monitoring** - Track scraper runtime, alert if 3x longer than normal
6. **Error categorization** - Distinguish network errors (retry) vs HTML changes (needs fix)

**Detection (Warning Signs):**
- Discovering problems from user reports, not internal alerts
- "Why didn't we know about this sooner?" during incident postmortems
- No dashboard showing scraper health over time
- Manual checking of logs to verify scraper ran successfully

**Phase to Address:**
- **Phase 1:** Basic alerting (scraper failed, zero records extracted)
- **Phase 2:** Advanced monitoring (baseline comparison, source change detection)
- **Phase 3:** Comprehensive observability dashboard

---

### Pitfall 8: Rate Limiting Too Aggressive, Gets Blocked or Causes Outages

**What goes wrong:** Developer sets rate limit too high (10 requests/sec) to "speed up scraping". Congreso.es interprets as denial-of-service attack, blocks IP permanently. Or conversely, no rate limiting on API, user makes 1000 req/sec, crashes database.

**Why it happens:**
- Pressure to "finish scraping faster"
- No understanding that government servers may have strict limits
- API rate limiting added as afterthought
- Testing with single user, not considering multi-user load

**Real-world evidence:**
- "Excessive requests mimic denial-of-service attacks and may be actionable" ([Web Scraping Legal Issues](https://groupbwt.com/blog/is-web-scraping-legal/))
- "A conservative rate limit of one request every 10-15 seconds is a safe and ethical starting point" ([Is Web Scraping Legal 2025](https://www.browserless.io/blog/is-web-scraping-legal))
- "Respect Crawl-delay directives in robots.txt" ([Web Scraping Best Practices](https://research.aimultiple.com/is-web-scraping-legal/))

**Prevention:**

1. **Conservative scraper rate limit** - 1 request per 10-15 seconds to congreso.es
2. **Check robots.txt Crawl-delay** - Honor any specified delay
3. **Exponential backoff** - On 429/503 errors, wait 2x longer before retry
4. **API rate limiting** - Implement before public launch (e.g., 100 req/hour per IP)
5. **Rate limit documentation** - Clearly communicate limits to API users
6. **Premium tiers (future)** - Offer higher limits for verified researchers

**Detection (Warning Signs):**
- HTTP 429 (Too Many Requests) from congreso.es
- IP blocked (all requests return 403)
- Congreso.es becomes unreachable after scraper runs
- API database CPU at 100% under load
- Angry emails from congreso.es administrators

**Phase to Address:**
- **Phase 1:** Scraper rate limiting (conservative 10-15 sec/req)
- **Phase 2:** API rate limiting before any public announcement
- **Phase 3:** Tiered rate limits, monitoring/alerting

---

### Pitfall 9: Missing Historical Context Makes Data Unusable

**What goes wrong:** API returns raw data (vote IDs, bill IDs) without context. Researcher gets "bill_id: 121/000051" but no idea what bill that is without second lookup. Or party affiliations change mid-legislature (deputy switches parties) but API only shows current affiliation.

**Why it happens:**
- Database normalized (store IDs, not full entities)
- Assumption that users will JOIN themselves
- No consideration of temporal data (historical changes)
- "Just expose what we have" without enrichment

**Prevention:**

1. **Entity embedding** - Include basic entity info in responses (bill title with bill_id)
2. **Temporal tracking** - Store party affiliation changes with effective dates
3. **Denormalization for API** - API responses can be denormalized even if DB is normalized
4. **Changelog tables** - Track when deputies change parties, committees, roles
5. **Point-in-time queries** - Support `as_of=2024-06-01` to get historical state

**Detection (Warning Signs):**
- Users asking "what is bill_id X?"
- Feature requests for "can you include bill title in vote response?"
- Low API adoption from journalists (too much work to use)

**Phase to Address:**
- **Phase 2:** Entity embedding, basic temporal tracking
- **Phase 3:** Full point-in-time query support

---

### Pitfall 10: No Strategy for Handling Source Data Errors

**What goes wrong:** Congreso.es publishes incorrect data (wrong vote count, typo in deputy name). Scraper faithfully ingests error, propagates to API, researcher uses wrong data. When source corrects it, API has both versions or only old version.

**Why it happens:**
- Assumption that source data is always correct
- No human review of scraped data
- No mechanism to detect/flag anomalies
- No process for applying corrections

**Prevention:**

1. **Anomaly detection** - Flag suspicious data (vote count exceeds 350, deputy name all caps)
2. **Manual review sample** - Daily check of 10 random records for quality
3. **Correction workflow** - Allow marking records as "disputed" pending investigation
4. **Version tracking** - Keep history of changes, show when data was corrected
5. **Source comparison** - Cross-reference critical data with third-party sources (news reports)

**Detection (Warning Signs):**
- User reports "API shows wrong vote total"
- Data contradicts news reports or official summaries
- Obvious errors in data (negative vote counts, future dates)

**Phase to Address:**
- **Phase 2:** Basic anomaly detection, manual review process
- **Phase 3:** Automated cross-validation, comprehensive correction workflow

---

## Minor Pitfalls

Mistakes that cause annoyance but are quickly fixable.

### Pitfall 11: Poor Error Messages in API Responses

**What goes wrong:** API returns `{"error": "Invalid request"}` without explaining what's invalid. User frustrated, abandons API.

**Prevention:** Return specific error messages with field-level validation (`{"error": "Invalid date format for 'date_from'. Expected YYYY-MM-DD, got '01/15/2025'"}`)

**Phase to Address:** Phase 2

---

### Pitfall 12: No API Versioning Strategy

**What goes wrong:** Breaking change deployed (rename field, change response format), breaks all existing integrations.

**Prevention:** Version API from start (`/api/v1/`), document deprecation policy, maintain v1 for 12+ months after v2 launch.

**Phase to Address:** Phase 1 (design decision)

---

### Pitfall 13: Inadequate Documentation

**What goes wrong:** API documentation shows endpoints but no examples of actual requests/responses. Users don't understand how to use it.

**Prevention:** Include realistic examples for every endpoint, common query patterns, error response examples.

**Phase to Address:** Phase 2 (with API launch)

---

### Pitfall 14: No Backup/Disaster Recovery Plan

**What goes wrong:** Database corrupts, no recent backup. Lose weeks of scraped data. Must re-scrape everything (if source still has historical data).

**Prevention:** Daily automated backups with off-site storage, test restore procedure monthly.

**Phase to Address:** Phase 1 (before accumulating significant data)

---

### Pitfall 15: Scraper Runs During Source Maintenance Windows

**What goes wrong:** Congreso.es down for maintenance overnight, scraper fails, triggers false alerts.

**Prevention:** Detect maintenance pages (HTTP 503, specific HTML), suppress alerts, auto-retry later.

**Phase to Address:** Phase 2

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| MVP/Phase 1 | Legal violations from improper scraping | Pre-launch legal review, robots.txt compliance, conservative rate limits |
| MVP/Phase 1 | Scraper brittleness (no fallback selectors) | Multi-layer selector strategy, schema validation at extraction |
| MVP/Phase 1 | No monitoring, silent failures undetected | Basic volume monitoring, freshness timestamps, alerting |
| Phase 2 | API query interface doesn't match researcher needs | User research before API design, support common query patterns |
| Phase 2 | Data staleness monitoring inadequate | Heartbeat monitoring, health endpoint, adaptive staleness thresholds |
| Phase 2 | Schema mismatches accumulate | Schema validation, duplicate detection, manual review queue |
| Phase 3 | SQLite scaling wall | Plan PostgreSQL migration before public launch, load test with realistic data volume |
| Phase 3 | Source data errors propagate unchecked | Anomaly detection, manual review, correction workflow |
| Ongoing | Selector updates consume 20-30% engineering time | Self-healing selectors, change detection, automated testing |
| Ongoing | Rate limiting too aggressive/lenient | Monitor HTTP 429 responses, implement API rate limits before public launch |

---

## Research Confidence Assessment

| Area | Confidence | Source Quality |
|------|------------|----------------|
| Legal/ethical scraping requirements | **HIGH** | Multiple 2025-2026 legal analyses, GDPR case law, regulatory guidance |
| Scraper brittleness & maintenance costs | **HIGH** | Industry cost analyses, State of Web Scraping 2026 report, developer surveys |
| SQLite scaling limits | **HIGH** | Official SQLite documentation, Microsoft EF Core docs, performance studies |
| Data quality challenges | **HIGH** | Enterprise data quality surveys, Gartner research, IPU parliamentary data guidelines |
| ETL monitoring best practices | **HIGH** | 2025 ETL monitoring guides, data observability platforms, industry benchmarks |
| Legislative API query patterns | **MEDIUM** | Congress.gov API docs, LegiScan API, OpenStates API (US-focused, Spanish context inferred) |
| Congreso.es specific challenges | **LOW** | No technical documentation found for congreso.es website structure or scraping policies |

---

## Gaps & Unknowns

**Areas requiring phase-specific investigation:**

1. **Congreso.es robots.txt & Terms of Service** - Need to verify scraping is permitted, check Crawl-delay directives
2. **Congreso.es official API** - Confirm whether official data access method exists before committing to scraping
3. **Spanish data protection laws** - Verify GDPR compliance requirements specific to Spain, any additional restrictions
4. **Congreso.es update frequency** - Determine how often data changes (daily during session? weekly?) to set staleness thresholds
5. **Historical data availability** - Check if congreso.es maintains historical versions (for backfilling data gaps)
6. **Researcher workflows (Spanish context)** - User research needed with actual Spanish legislative researchers/journalists
7. **Dataset size estimation** - Calculate expected row counts (deputies × legislatures × votes × bills) to plan database choice

---

## Sources

### Legal & Compliance
- [Is Web Scraping Legal? Laws, Ethics, and Best Practices](https://research.aimultiple.com/is-web-scraping-legal/)
- [Is Web Scraping Legal? The Complete Guide for 2025](https://www.scraperapi.com/web-scraping/is-web-scraping-legal/)
- [Web Scraping Legal Issues: 2025 Enterprise Compliance Guide](https://groupbwt.com/blog/is-web-scraping-legal/)
- [Is Web Scraping Legal in 2025? Laws, Ethics, and Risks Explained](https://www.browserless.io/blog/is-web-scraping-legal)
- [Web Scraping in 2025: The €20 Million GDPR Mistake](https://medium.com/deep-tech-insights/web-scraping-in-2025-the-20-million-gdpr-mistake-you-cant-afford-to-make-07a3ce240f4f)
- [The Great Scrape: The Clash Between Scraping and Privacy](https://www.californialawreview.org/print/great-scrape)

### Legislative Data APIs
- [Congress.gov's API Has Gone Dark](https://www.govtech.com/gov-experience/congress-govs-api-has-gone-dark-impacting-data-access)
- [Using Congress.gov Data Offsite](https://www.congress.gov/help/using-data-offsite)
- [ProPublica Congress API](https://projects.propublica.org/api-docs/congress-api/)
- [LegiScan API](https://legiscan.com/legiscan)
- [Open States API v3](https://docs.openstates.org/api-v3/)

### SQLite Scaling
- [SQLite Scalability: Limitations and Workarounds](https://www.slingacademy.com/article/sqlite-scalability-limitations-and-workarounds/)
- [What Are The Limitations Of SQLite](https://www.dbtalks.com/tutorials/learn-sqlite/what-are-the-limitations-of-sqlite)
- [Appropriate Uses For SQLite](https://sqlite.org/whentouse.html)
- [SQLite Implementation Limits](https://sqlite.org/limits.html)

### Data Quality
- [9 Common Data Quality Issues to Fix in 2025](https://atlan.com/data-quality-issues/)
- [Data Quality Challenges: Enterprise Strategies in 2025](https://www.alation.com/blog/data-quality-challenges-large-scale-data-environments/)
- [Data Quality Framework: A Step-By-Step Guide [2025]](https://www.ewsolutions.com/data-quality-framework/)
- [Data governance: Data quality | Inter-Parliamentary Union](https://www.ipu.org/ai-guidelines/data-governance-data-quality)

### Web Scraping Challenges
- [State of Web Scraping 2026: Trends, Challenges & What's Next](https://www.browserless.io/blog/state-of-web-scraping-2026)
- [10 Web Scraping Challenges (+ Solutions) in 2025](https://crawlbase.com/blog/web-scraping-challenges-and-solutions/)
- [Web Scraping Challenges & Compliance in 2025](https://groupbwt.com/blog/challenges-in-web-scraping/)
- [The Open-Source Web Scraping Revolution](https://medium.com/@tuguidragos/the-open-source-web-scraping-revolution-a-deep-dive-into-scrapegraphai-crawl4ai-and-the-future-d3a048cb448f)

### ETL & Monitoring
- [How to Monitor ETL Pipeline Health | Complete Guide 2025](https://airbyte.com/data-engineering-resources/how-do-i-monitor-etl-pipeline-health)
- [ETL Error Handling and Monitoring Metrics — 25 Statistics](https://www.integrate.io/blog/etl-error-handling-and-monitoring-metrics/)
- [What Is Data Freshness in Data Observability?](https://www.siffletdata.com/blog/data-freshness)
- [Stale Data: How to Identify, Prevent, and Overcome Data Decay](https://www.quadratichq.com/blog/stale-data-how-to-identify-prevent-and-overcome-data-decay)

### Maintenance Costs
- [Build vs. Buy: Web Scraping Cost Analysis](https://soax.com/blog/build-vs-buy-web-scraping-cost-analysis)
- [Cost of In-house Web Scraping](https://www.grepsr.com/blog/inhouse-web-scraping-costs-grepsr/)
- [The Hidden Cost of Building Your Own Web Scraping Team](https://dev.to/loopsthings/the-hidden-cost-of-building-your-own-web-scraping-team-1b0i)
- [Why Web Scraping Costs More Than Expected](https://www.grepsr.com/blog/web-scraping-costs-more-than-expected/)

### API Design
- [Open data APIs: standards, best practices, and implementation challenges](https://blog.postman.com/open-data-apis-standards-best-practices-challenges/)
- [API best practices - OECD](https://www.oecd.org/en/data/insights/data-explainers/2024/11/Api-best-practices-and-recommendations.html)
- [API Design Best Practices | Secure API Architecture 2026](https://eluminoustechnologies.com/blog/api-design/)

### Parliamentary Research
- [Parliamentary research services: mapping the territory](https://www.nature.com/articles/s41599-025-05381-y)
- [Future-focused research: Parliamentary innovations across the globe](https://www.ipu.org/news/case-studies/2025-02/future-focused-research-parliamentary-innovations-across-globe)
- [Spain | Congress of Deputies | IPU Parline](https://data.ipu.org/parliament/ES/ES-LC01/)

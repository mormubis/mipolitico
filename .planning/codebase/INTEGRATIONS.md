# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Spanish Congress Open Data:**
- https://www.congreso.es/es/opendata/diputados - Active deputies JSON data
  - SDK/Client: Native `fetch` API with custom pooling
  - Auth: None (public API)
  - Data format: JSON streaming via `oboe`

- https://www.congreso.es/es/opendata/organos - Bureau composition data
  - SDK/Client: Playwright browser automation + native `fetch`
  - Auth: None (public API)
  - Data format: JSON streaming via `oboe`

**Data Scraping:**
- Playwright automation extracts data export URLs from congress.es web pages
- POST requests to dynamically discovered endpoints
- JSON streaming for large datasets

## Data Storage

**Databases:**
- SQLite3
  - Connection: Not detected (library declared but not used in current code)
  - Client: `sqlite3` 5.1.7

**File Storage:**
- Local filesystem only

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- None - All data sources are public

**Implementation:**
- No authentication required for congress.es open data endpoints

## Monitoring & Observability

**Error Tracking:**
- None - Console logging only

**Logs:**
- `console.log()` for successful data retrieval
- `console.error()` for error handling
- `console.warn()` for browser launch failures

## CI/CD & Deployment

**Hosting:**
- Not applicable - Local data ingestion tool

**CI Pipeline:**
- None - No GitHub Actions or other CI configuration detected

**Git Hooks:**
- Husky pre-commit hook at `.husky/pre-commit`
- Runs lint-staged (Prettier + ESLint) on staged files

## Environment Configuration

**Required env vars:**
- None - No environment variables used

**Secrets location:**
- Not applicable - No secrets required

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Network Patterns

**Rate Limiting:**
- Custom pooling via `p-limit` (5 concurrent operations)
- Random delays (1-5 seconds) before request execution
- Random delays (1-3 seconds) before browser navigation
- Retry logic with 15-second delay and 1 retry attempt

**Browser Automation:**
- Playwright with proxy wrappers for:
  - Concurrent page limit enforcement
  - Delayed navigation to avoid detection
  - Browser type rotation (Chromium, Firefox, WebKit)
  - Automatic fallback on browser launch failure

**Data Streaming:**
- Oboe.js for streaming JSON parsing
- RxJS Observables for data flow management
- Node.js Readable streams for response body handling

---

*Integration audit: 2026-01-20*

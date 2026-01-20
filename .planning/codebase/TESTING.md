# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Framework

**Runner:**
- Not configured - no test framework detected
- `package.json` script: `"test": "echo \"Error: no test specified\" && exit 1"`
- No Jest, Vitest, or Mocha configuration files found

**Assertion Library:**
- None configured

**Run Commands:**
```bash
pnpm test              # Currently exits with error
```

## Test File Organization

**Location:**
- No test files found in source code
- Pattern: Not established

**Naming:**
- No established pattern (no test files present)
- Expected patterns based on common conventions:
  - `*.test.ts` for unit tests
  - `*.spec.ts` for specification tests

**Structure:**
- Not applicable (no tests present)

## Test Structure

**Suite Organization:**
Not applicable - no test framework configured

**Patterns:**
- No testing patterns established
- No setup/teardown patterns
- No test suites present

## Mocking

**Framework:**
- None configured

**Patterns:**
- No mocking patterns established

**What to Mock:**
- Guidelines not established
- Recommended candidates for future testing:
  - Browser automation (Playwright): `browser.newPage()`, `page.goto()`
  - HTTP fetch calls: `globalThis.fetch()`
  - External API responses (oboe streams)
  - File system operations

**What NOT to Mock:**
- Guidelines not established

## Fixtures and Factories

**Test Data:**
- No test fixtures present
- Example data files exist in `examples/` directory that could serve as test fixtures

**Location:**
- Not applicable (no test infrastructure)
- Suggested location for future: `apps/ingestion/src/__tests__/fixtures/`

## Coverage

**Requirements:**
- No coverage requirements enforced
- No coverage tooling configured

**View Coverage:**
```bash
# Not configured
```

## Test Types

**Unit Tests:**
- None present
- Recommended scope for future:
  - Utility functions: `random()`, `romanize()`, `shuffle()`, `sleep()` in `apps/ingestion/src/utils.ts`
  - Schema validation with Zod schemas
  - Data transformation logic

**Integration Tests:**
- None present
- Recommended scope for future:
  - Source finders and retrievers: `apps/ingestion/src/sources/*.ts`
  - Network layer: `apps/ingestion/src/network/pool.ts`, `apps/ingestion/src/network/fetch.ts`
  - Browser automation workflows: `apps/ingestion/src/network/browser.ts`

**E2E Tests:**
- None present
- Recommended framework for future: Playwright (already in dependencies)
- Recommended scope:
  - Full data ingestion pipelines
  - Browser scraping workflows

## Common Patterns

**Async Testing:**
Not applicable - no test patterns established

**Suggested pattern for future:**
```typescript
// Example using async/await with observables
test('retriever emits data', async () => {
  const results: Model[] = [];

  await new Promise((resolve, reject) => {
    retriever({ url: 'test-url', browser, fetch })
      .subscribe({
        next: (value) => results.push(value),
        complete: resolve,
        error: reject,
      });
  });

  expect(results.length).toBeGreaterThan(0);
});
```

**Error Testing:**
Not applicable - no test patterns established

**Suggested pattern for future:**
```typescript
// Example for testing error handling
test('retriever throws on invalid response', async () => {
  const mockFetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  });

  await expect(
    new Promise((resolve, reject) => {
      retriever({ url: 'test-url', browser, fetch: mockFetch })
        .subscribe({
          next: resolve,
          error: reject,
        });
    })
  ).rejects.toThrow('Failed to fetch person data: 404 Not Found');
});
```

## Testing Gaps

**Critical Untested Areas:**

1. **Data Validation** - `apps/ingestion/src/sources/*.ts`
   - Zod schema validation logic
   - Data transformation and parsing
   - Risk: Invalid data may pass through undetected

2. **Network Layer** - `apps/ingestion/src/network/`
   - Request pooling and rate limiting (`pool.ts`)
   - Browser automation proxies (`browser.ts`)
   - Random delays and retry logic
   - Risk: Rate limiting failures, browser crashes

3. **Utility Functions** - `apps/ingestion/src/utils.ts`
   - `romanize()` algorithm correctness
   - `shuffle()` randomness distribution
   - `random()` bounds checking
   - Risk: Logic errors in data processing

4. **Change Detection** - `apps/ingestion/src/detectors/change-detection.service.ts`
   - Hash calculation for change detection
   - Storage implementation (marked as TODO)
   - Risk: Duplicate data ingestion, missed changes

5. **Error Handling Paths**
   - Observable error propagation
   - Browser disconnection handling
   - Network timeout scenarios
   - Risk: Silent failures, incomplete data

## Recommendations

**Immediate Priorities:**

1. **Set up test framework**
   - Install Jest or Vitest
   - Configure TypeScript support
   - Add test scripts to `package.json`

2. **Start with utility functions**
   - High value, low complexity
   - Pure functions easy to test
   - File: `apps/ingestion/src/utils.ts`

3. **Add integration tests for sources**
   - Mock browser and fetch dependencies
   - Test schema validation
   - Files: `apps/ingestion/src/sources/*.ts`

4. **Configure coverage thresholds**
   - Set minimum coverage goals
   - Integrate with pre-commit hooks
   - Target: 70% coverage minimum

5. **Add E2E smoke tests**
   - Use Playwright (already available)
   - Test one complete data ingestion flow
   - Catch integration issues early

---

*Testing analysis: 2026-01-20*

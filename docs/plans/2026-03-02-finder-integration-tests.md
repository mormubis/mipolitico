# Finder Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Write a manual runner script that exercises all 7 finders against the
live congress.es site and validates output shape, with no new dependencies.

**Architecture:** Single `src/test/finders.test.ts` script in `apps/ingestion`.
Run with `node --import tsx/esm`. One shared Playwright browser for all finders.
The `intervention` finder is refactored to accept an optional `dateFrom` in
`FinderOptions` so the DB is not required in tests.

**Tech Stack:** Playwright (already a dependency), Node.js global `fetch`,
TypeScript via tsx.

---

### Task 1: Extend `FinderOptions` with optional `dateFrom`

**Files:**

- Modify: `apps/ingestion/src/types.ts`

**Step 1: Open the file and read the current `FinderOptions` type**

```
apps/ingestion/src/types.ts
```

Current shape:

```ts
type FinderOptions = CommonOptions;
```

**Step 2: Add `dateFrom?: Date` to `FinderOptions`**

Change:

```ts
type FinderOptions = CommonOptions;
```

To:

```ts
type FinderOptions = CommonOptions & {
  dateFrom?: Date;
};
```

**Step 3: Verify types compile**

Run:

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/types.ts
git commit -m "feat(ingestion): add optional dateFrom to FinderOptions"
```

---

### Task 2: Use `dateFrom` in `intervention` finder

**Files:**

- Modify: `apps/ingestion/src/finders/intervention.ts`

**Step 1: Read the file**

`apps/ingestion/src/finders/intervention.ts` lines 39–45:

```ts
const finder: Finder = async ({ browser, fetch }) => {
  const lastRun = await getLastSuccessfulRun('intervention');
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;
```

**Step 2: Destructure `dateFrom` from options, fall back to DB call**

Change the finder signature and first lines:

```ts
const finder: Finder = async ({ browser, fetch, dateFrom: dateFromOption }) => {
  const lastRun = dateFromOption ?? (await getLastSuccessfulRun('intervention'));
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;
```

**Step 3: Verify types compile**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/finders/intervention.ts
git commit -m "feat(ingestion): intervention finder accepts optional dateFrom to skip DB call"
```

---

### Task 3: Create the test runner script

**Files:**

- Create: `apps/ingestion/src/test/finders.test.ts`

**Step 1: Create the file with this content**

```ts
import { chromium } from 'playwright';

import { finder as bureau } from '../finders/bureau.ts';
import { finder as initiatives } from '../finders/initiatives.ts';
import { finder as interestDeclarations } from '../finders/interest-declarations.ts';
import { finder as intervention } from '../finders/intervention.ts';
import { finder as person } from '../finders/person.ts';
import { finder as personDetail } from '../finders/person-detail.ts';
import { finder as voting } from '../finders/voting.ts';

import type { Needle } from '../types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AssertionError {
  finder: string;
  message: string;
}

const errors: AssertionError[] = [];

function assert(finder: string, condition: boolean, message: string): void {
  if (!condition) {
    errors.push({ finder, message });
    console.error(`  FAIL: ${message}`);
  }
}

function normalise(result: string | string[] | Needle[]): Needle[] {
  if (typeof result === 'string') return [{ url: result }];
  if (Array.isArray(result) && result.every((r) => typeof r === 'string')) {
    return (result as string[]).map((url) => ({ url }));
  }
  return result as Needle[];
}

async function run(
  label: string,
  fn: () => Promise<string | string[] | Needle[]>,
): Promise<Needle[]> {
  const start = Date.now();
  try {
    const result = normalise(await fn());
    const elapsed = Date.now() - start;
    console.log(
      `  PASS (${elapsed.toString()}ms) — ${result.length.toString()} needle(s)`,
    );
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ finder: label, message });
    console.error(`  FAIL (${elapsed.toString()}ms): ${message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const opts = { browser, fetch: globalThis.fetch };

    // -----------------------------------------------------------------------
    // person
    // -----------------------------------------------------------------------
    console.log('\n[person]');
    const personResult = await run('person', () => person(opts));
    assert(
      'person',
      personResult.length === 1,
      'should return exactly 1 needle',
    );
    if (personResult[0]) {
      assert(
        'person',
        personResult[0].url.startsWith('https://'),
        'url should start with https://',
      );
      assert(
        'person',
        personResult[0].url.endsWith('.json'),
        'url should end with .json',
      );
    }

    // -----------------------------------------------------------------------
    // person-detail
    // -----------------------------------------------------------------------
    console.log('\n[person-detail]');
    const personDetailResult = await run('person-detail', () =>
      personDetail(opts),
    );
    assert(
      'person-detail',
      personDetailResult.length > 0,
      'should return at least one needle',
    );
    for (const needle of personDetailResult.slice(0, 5)) {
      assert(
        'person-detail',
        typeof needle.url === 'string' && needle.url.length > 0,
        'url should be a non-empty string',
      );
      assert(
        'person-detail',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'codParlamentario' in (needle.extra as object),
        'extra should have codParlamentario',
      );
    }

    // -----------------------------------------------------------------------
    // voting
    // -----------------------------------------------------------------------
    console.log('\n[voting]');
    const votingResult = await run('voting', () => voting(opts));
    assert(
      'voting',
      votingResult.length > 0,
      'should return at least one needle',
    );
    for (const needle of votingResult.slice(0, 5)) {
      assert(
        'voting',
        needle.url.endsWith('.json'),
        'url should end with .json',
      );
      assert(
        'voting',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'legislature' in (needle.extra as object),
        'extra should have legislature',
      );
      const extra = needle.extra as { legislature: unknown };
      assert(
        'voting',
        typeof extra.legislature === 'number' || extra.legislature === null,
        'legislature should be a number or null',
      );
    }

    // -----------------------------------------------------------------------
    // intervention (dateFrom hardcoded — no DB required)
    // -----------------------------------------------------------------------
    console.log('\n[intervention]');
    const interventionResult = await run('intervention', () =>
      intervention({ ...opts, dateFrom: new Date('2025-01-01') }),
    );
    for (const needle of interventionResult.slice(0, 5)) {
      assert(
        'intervention',
        typeof needle.url === 'string' && needle.url.length > 0,
        'url should be a non-empty string',
      );
    }

    // -----------------------------------------------------------------------
    // bureau
    // -----------------------------------------------------------------------
    console.log('\n[bureau]');
    const bureauResult = await run('bureau', () => bureau(opts));
    assert(
      'bureau',
      bureauResult.length === 1,
      'should return exactly 1 needle',
    );
    if (bureauResult[0]) {
      assert(
        'bureau',
        bureauResult[0].url.startsWith('https://'),
        'url should start with https://',
      );
    }

    // -----------------------------------------------------------------------
    // initiatives
    // -----------------------------------------------------------------------
    console.log('\n[initiatives]');
    const initiativesResult = await run('initiatives', () => initiatives(opts));
    assert(
      'initiatives',
      initiativesResult.length >= 1 && initiativesResult.length <= 4,
      'should return 1–4 needles',
    );
    for (const needle of initiativesResult) {
      assert(
        'initiatives',
        needle.url.includes('.json'),
        'url should contain .json',
      );
      assert(
        'initiatives',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'category' in (needle.extra as object),
        'extra should have category',
      );
      const extra = needle.extra as { category: unknown };
      assert(
        'initiatives',
        typeof extra.category === 'string',
        'category should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // interest-declarations
    // -----------------------------------------------------------------------
    console.log('\n[interest-declarations]');
    const interestResult = await run('interest-declarations', () =>
      interestDeclarations(opts),
    );
    assert(
      'interest-declarations',
      interestResult.length > 0,
      'should return at least one needle',
    );
    for (const needle of interestResult.slice(0, 5)) {
      assert(
        'interest-declarations',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'codParlamentario' in (needle.extra as object),
        'extra should have codParlamentario',
      );
      assert(
        'interest-declarations',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'declarations' in (needle.extra as object) &&
          Array.isArray(
            (needle.extra as { declarations: unknown }).declarations,
          ),
        'extra.declarations should be an array',
      );
    }
  } finally {
    await browser.close();
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n---');
  if (errors.length === 0) {
    console.log('All finders passed.');
  } else {
    console.error(`${errors.length.toString()} assertion(s) failed:`);
    for (const e of errors) {
      console.error(`  [${e.finder}] ${e.message}`);
    }
    process.exitCode = 1;
  }
}

void main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
```

**Step 2: Verify types compile**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/test/finders.test.ts
git commit -m "test(ingestion): add finder integration test runner"
```

---

### Task 4: Add `test:integration` script to package.json

**Files:**

- Modify: `apps/ingestion/package.json`

**Step 1: Add the script**

In `apps/ingestion/package.json`, in the `scripts` object, add:

```json
"test:integration": "node --import tsx/esm src/test/finders.test.ts"
```

**Step 2: Verify the script runs (this will hit the live site — may take a few
minutes)**

```bash
pnpm --filter @congress/ingestion test:integration
```

Expected: each finder logs `PASS` with a needle count; final line is
`All finders passed.`

**Step 3: Commit**

```bash
git add apps/ingestion/package.json
git commit -m "chore(ingestion): add test:integration script for finder smoke tests"
```

---

### Task 5: Fix any lint warnings

**Files:**

- Potentially: `apps/ingestion/src/test/finders.test.ts`

**Step 1: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

**Step 2: Fix any reported issues**

Common issues to watch for:

- Import ordering (builtin/external before internal, type imports last,
  alphabetical)
- Missing `.ts` extension on relative imports
- No default exports (already fine — file has none)
- `import type` for type-only imports

**Step 3: Commit if changes were needed**

```bash
git add apps/ingestion/src/test/finders.test.ts
git commit -m "fix(ingestion): lint fixes for finder test runner"
```

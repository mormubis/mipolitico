import { chromium } from 'playwright';

import { finder as bureau } from '../finders/bureau.ts';
import { finder as initiatives } from '../finders/initiatives.ts';
import { finder as interestDeclarations } from '../finders/interest-declarations.ts';
import { finder as intervention } from '../finders/intervention.ts';
import { finder as personDetail } from '../finders/person-detail.ts';
import { finder as person } from '../finders/person.ts';
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
    return result.map((url) => ({ url }));
  }
  return result;
}

async function run(
  label: string,
  fn: () =>
    | string
    | string[]
    | Needle[]
    | Promise<string | string[] | Needle[]>,
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
          'codParlamentario' in needle.extra,
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
          'legislature' in needle.extra,
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
    assert(
      'intervention',
      interventionResult.length > 0,
      'should return at least one needle',
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
          'category' in needle.extra,
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
          'codParlamentario' in needle.extra,
        'extra should have codParlamentario',
      );
      assert(
        'interest-declarations',
        needle.extra !== null &&
          typeof needle.extra === 'object' &&
          'declarations' in needle.extra &&
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

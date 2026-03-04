import { chromium } from 'playwright';
import { lastValueFrom, toArray } from 'rxjs';

import { finder as bureau } from '../finders/bureau.ts';
import { finder as initiatives } from '../finders/initiatives.ts';
import { finder as interestDeclarations } from '../finders/interest-declarations.ts';
import { finder as intervention } from '../finders/intervention.ts';
import { finder as personDetail } from '../finders/person-detail.ts';
import { finder as person } from '../finders/person.ts';
import { finder as voting } from '../finders/voting.ts';

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

async function run(
  label: string,
  fn: () => Promise<string[]>,
): Promise<string[]> {
  const start = Date.now();
  try {
    const urls = await fn();
    const elapsed = Date.now() - start;
    console.log(
      `  PASS (${elapsed.toString()}ms) — ${urls.length.toString()} url(s)`,
    );
    return urls;
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ finder: label, message });
    console.error(`  FAIL (${elapsed.toString()}ms): ${message}`);
    return [];
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const opts = { browser, fetch: globalThis.fetch };

    // person
    console.log('\n[person]');
    const personUrls = await run('person', () =>
      lastValueFrom(person(opts).pipe(toArray())),
    );
    assert('person', personUrls.length === 1, 'should emit exactly 1 url');
    assert(
      'person',
      personUrls[0]?.startsWith('https://') ?? false,
      'url should start with https://',
    );
    assert(
      'person',
      personUrls[0]?.endsWith('.json') ?? false,
      'url should end with .json',
    );

    // person-detail
    console.log('\n[person-detail]');
    const personDetailUrls = await run('person-detail', () =>
      lastValueFrom(personDetail(opts).pipe(toArray())),
    );
    assert(
      'person-detail',
      personDetailUrls.length > 0,
      'should emit at least one url',
    );
    for (const url of personDetailUrls.slice(0, 5)) {
      assert(
        'person-detail',
        url.includes('codParlamentario'),
        'url should include codParlamentario param',
      );
    }

    // voting
    console.log('\n[voting]');
    const votingUrls = await run('voting', () =>
      lastValueFrom(voting(opts).pipe(toArray())),
    );
    assert('voting', votingUrls.length > 0, 'should emit at least one url');
    for (const url of votingUrls.slice(0, 5)) {
      assert('voting', url.endsWith('.json'), 'url should end with .json');
    }

    // intervention
    console.log('\n[intervention]');
    const interventionUrls = await run('intervention', () =>
      lastValueFrom(intervention(opts).pipe(toArray())),
    );
    assert(
      'intervention',
      interventionUrls.length > 0,
      'should emit at least one url',
    );
    for (const url of interventionUrls.slice(0, 5)) {
      assert(
        'intervention',
        url.startsWith('https://'),
        'url should start with https://',
      );
    }

    // bureau
    console.log('\n[bureau]');
    const bureauUrls = await run('bureau', () =>
      lastValueFrom(bureau(opts).pipe(toArray())),
    );
    assert('bureau', bureauUrls.length === 1, 'should emit exactly 1 url');
    assert(
      'bureau',
      bureauUrls[0]?.startsWith('https://') ?? false,
      'url should start with https://',
    );

    // initiatives
    console.log('\n[initiatives]');
    const initiativesUrls = await run('initiatives', () =>
      lastValueFrom(initiatives(opts).pipe(toArray())),
    );
    assert(
      'initiatives',
      initiativesUrls.length >= 1 && initiativesUrls.length <= 4,
      'should emit 1–4 urls',
    );
    for (const url of initiativesUrls) {
      assert('initiatives', url.includes('.json'), 'url should contain .json');
    }

    // interest-declarations
    console.log('\n[interest-declarations]');
    const interestUrls = await run('interest-declarations', () =>
      lastValueFrom(interestDeclarations(opts).pipe(toArray())),
    );
    assert(
      'interest-declarations',
      interestUrls.length === 1,
      'should emit exactly 1 url',
    );
    assert(
      'interest-declarations',
      interestUrls[0]?.includes('docacteco') ?? false,
      'url should include docacteco',
    );
  } finally {
    await browser.close();
  }

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

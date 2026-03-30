import { chromium } from 'playwright';
import { lastValueFrom, toArray } from 'rxjs';

import { finder as bureau } from '../finders/bureau.ts';
import { finder as declaration } from '../finders/declaration.ts';
import { finder as deputyDetail } from '../finders/deputy-detail.ts';
import { finder as deputy } from '../finders/deputy.ts';
import { finder as initiative } from '../finders/initiative.ts';
import { finder as intervention } from '../finders/intervention.ts';
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

    // deputy
    console.log('\n[deputy]');
    const deputyUrls = await run('deputy', () =>
      lastValueFrom(deputy(opts).pipe(toArray())),
    );
    assert('deputy', deputyUrls.length === 1, 'should emit exactly 1 url');
    assert(
      'deputy',
      deputyUrls[0]?.startsWith('https://') ?? false,
      'url should start with https://',
    );
    assert(
      'deputy',
      deputyUrls[0]?.endsWith('.json') ?? false,
      'url should end with .json',
    );

    // deputy-detail
    console.log('\n[deputy-detail]');
    const deputyDetailUrls = await run('deputy-detail', () =>
      lastValueFrom(deputyDetail(opts).pipe(toArray())),
    );
    assert(
      'deputy-detail',
      deputyDetailUrls.length > 0,
      'should emit at least one url',
    );
    for (const url of deputyDetailUrls.slice(0, 5)) {
      assert(
        'deputy-detail',
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

    // initiative
    console.log('\n[initiative]');
    const initiativeUrls = await run('initiative', () =>
      lastValueFrom(initiative(opts).pipe(toArray())),
    );
    assert(
      'initiative',
      initiativeUrls.length >= 1 && initiativeUrls.length <= 4,
      'should emit 1–4 urls',
    );
    for (const url of initiativeUrls) {
      assert('initiative', url.includes('.json'), 'url should contain .json');
    }

    // declaration
    console.log('\n[declaration]');
    const declarationUrls = await run('declaration', () =>
      lastValueFrom(declaration(opts).pipe(toArray())),
    );
    assert(
      'declaration',
      declarationUrls.length === 1,
      'should emit exactly 1 url',
    );
    assert(
      'declaration',
      declarationUrls[0]?.includes('docacteco') ?? false,
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

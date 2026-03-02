# Retriever Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Write a manual runner script that exercises all 6 active retrievers
against the live congress.es site and validates output shape, with no new
dependencies.

**Architecture:** Single `src/test/retrievers.test.ts` script in
`apps/ingestion`. Run with `node --import tsx/esm`. One shared Playwright
browser. Three retrievers (`person`, `bureau`, `initiatives`) run their
corresponding finder first to get a fresh URL; three others (`voting`,
`intervention`, `interest-declarations`) use hardcoded stable needles. Each
retriever Observable is drained with `take(5)` + `toArray()` + `lastValueFrom`
from RxJS (already a dependency).

**Tech Stack:** Playwright, RxJS (`take`, `toArray`, `lastValueFrom`), Node.js
global `fetch`, TypeScript via tsx.

---

### Task 1: Create the retriever test runner script

**Files:**

- Create: `apps/ingestion/src/test/retrievers.test.ts`

**Step 1: Create the file with this exact content**

```ts
import { lastValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { chromium } from 'playwright';

import { finder as bureauFinder } from '../finders/bureau.ts';
import { finder as initiativesFinder } from '../finders/initiatives.ts';
import { finder as personFinder } from '../finders/person.ts';
import { retriever as bureauRetriever } from '../retrievers/bureau.ts';
import { retriever as initiativesRetriever } from '../retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from '../retrievers/interest-declarations.ts';
import { retriever as interventionRetriever } from '../retrievers/intervention.ts';
import { retriever as personRetriever } from '../retrievers/person.ts';
import { retriever as votingRetriever } from '../retrievers/voting.ts';

import type { Needle } from '../types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AssertionError {
  retriever: string;
  message: string;
}

const errors: AssertionError[] = [];

function assert(retriever: string, condition: boolean, message: string): void {
  if (!condition) {
    errors.push({ retriever, message });
    console.error(`  FAIL: ${message}`);
  }
}

function firstNeedle(result: string | string[] | Needle[]): Needle {
  if (typeof result === 'string') return { url: result };
  if (Array.isArray(result) && typeof result[0] === 'string')
    return { url: result[0] as string };
  const needles = result as Needle[];
  const first = needles[0];
  if (!first) throw new Error('Finder returned no needles');
  return first;
}

async function run<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  const start = Date.now();
  try {
    const records = await fn();
    const elapsed = Date.now() - start;
    console.log(
      `  PASS (${elapsed.toString()}ms) — ${records.length.toString()} record(s)`,
    );
    return records;
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ retriever: label, message });
    console.error(`  FAIL (${elapsed.toString()}ms): ${message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hardcoded needles
// ---------------------------------------------------------------------------

const VOTING_NEEDLE: Needle = {
  url: 'https://www.congreso.es/webpublica/opendata/votaciones/Leg15/Sesion1.json',
  extra: { legislature: 15, session: 1 },
};

const INTERVENTION_NEEDLE: Needle = {
  url: 'https://www.congreso.es/busqueda-de-intervenciones?p_p_id=intervenciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_intervenciones_mode=mostrarTextoIntegro&_intervenciones_legislatura=XV&_intervenciones_id_texto=(DSCD-15-CO-492.CODI.)#(P%C3%A1gina2)',
};

const INTEREST_DECLARATIONS_NEEDLE: Needle = {
  url: 'https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=160&idLegislatura=XV&mostrarAgenda=false',
  extra: {
    codParlamentario: 160,
    idLegislatura: 15,
    declarations: [
      {
        NOMBRE: 'Abades Martínez,Cristina',
        FECHAREGISTRO: '08/08/2023',
        DECLARACION: 'Declaración inicial',
        TIPO: 'ACTIVIDAD',
        PERIODO: '2018',
        EMPLEADOR: 'AYUNTAMIENTO DE CERVO',
        SECTOR: 'PÚBLICO',
        DESCRIPCION: 'FUNCIONARIA. LETRADA-ASESORA',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const opts = { browser, fetch: globalThis.fetch };

    // -----------------------------------------------------------------------
    // person — run finder to get fresh timestamped URL
    // -----------------------------------------------------------------------
    console.log('\n[person] resolving needle via finder...');
    const personNeedle = firstNeedle(await personFinder(opts));

    console.log('\n[person]');
    const personRecords = await run('person', () =>
      lastValueFrom(
        personRetriever({ ...opts, ...personNeedle }).pipe(take(5), toArray()),
      ),
    );
    assert(
      'person',
      personRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of personRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'person',
        typeof rec['NOMBRE'] === 'string' &&
          (rec['NOMBRE'] as string).length > 0,
        'NOMBRE should be a non-empty string',
      );
      assert(
        'person',
        typeof rec['FORMACIONELECTORAL'] === 'string',
        'FORMACIONELECTORAL should be a string',
      );
      assert(
        'person',
        typeof rec['GRUPOPARLAMENTARIO'] === 'string',
        'GRUPOPARLAMENTARIO should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // voting — hardcoded stable needle
    // -----------------------------------------------------------------------
    console.log('\n[voting]');
    const votingRecords = await run('voting', () =>
      lastValueFrom(
        votingRetriever({ ...opts, ...VOTING_NEEDLE }).pipe(take(5), toArray()),
      ),
    );
    assert(
      'voting',
      votingRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of votingRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'voting',
        typeof rec['LEGISLATURE'] === 'number',
        'LEGISLATURE should be a number',
      );
      assert(
        'voting',
        typeof rec['VOTING_DATE'] === 'string' &&
          (rec['VOTING_DATE'] as string).length > 0,
        'VOTING_DATE should be a non-empty string',
      );
      assert(
        'voting',
        typeof rec['VOTE'] === 'string',
        'VOTE should be a string',
      );
      assert(
        'voting',
        typeof rec['JSON_URL'] === 'string',
        'JSON_URL should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // bureau — run finder to capture POST URL
    // -----------------------------------------------------------------------
    console.log('\n[bureau] resolving needle via finder...');
    const bureauNeedle = firstNeedle(await bureauFinder(opts));

    console.log('\n[bureau]');
    const bureauRecords = await run('bureau', () =>
      lastValueFrom(
        bureauRetriever({ ...opts, ...bureauNeedle }).pipe(take(5), toArray()),
      ),
    );
    assert(
      'bureau',
      bureauRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of bureauRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'bureau',
        typeof rec['Nombre'] === 'string' &&
          (rec['Nombre'] as string).length > 0,
        'Nombre should be a non-empty string',
      );
      assert(
        'bureau',
        typeof rec['NombreOrgano'] === 'string' &&
          (rec['NombreOrgano'] as string).length > 0,
        'NombreOrgano should be a non-empty string',
      );
      assert(
        'bureau',
        typeof rec['Cargo'] === 'string',
        'Cargo should be a string',
      );
      assert(
        'bureau',
        typeof rec['FechaAlta'] === 'string',
        'FechaAlta should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // intervention — hardcoded stable needle
    // -----------------------------------------------------------------------
    console.log('\n[intervention]');
    const interventionRecords = await run('intervention', () =>
      lastValueFrom(
        interventionRetriever({ ...opts, ...INTERVENTION_NEEDLE }).pipe(
          take(5),
          toArray(),
        ),
      ),
    );
    assert(
      'intervention',
      interventionRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of interventionRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'intervention',
        typeof rec['SESSION_ID'] === 'string' &&
          (rec['SESSION_ID'] as string).length > 0,
        'SESSION_ID should be a non-empty string',
      );
      assert(
        'intervention',
        typeof rec['SPEAKER'] === 'string' &&
          (rec['SPEAKER'] as string).length > 0,
        'SPEAKER should be a non-empty string',
      );
      assert(
        'intervention',
        typeof rec['TEXT'] === 'string' && (rec['TEXT'] as string).length > 0,
        'TEXT should be a non-empty string',
      );
    }

    // -----------------------------------------------------------------------
    // initiatives — run finder to get fresh timestamped URL, take first needle
    // -----------------------------------------------------------------------
    console.log('\n[initiatives] resolving needle via finder...');
    const initiativesResult = await initiativesFinder(opts);
    const initiativesNeedles = initiativesResult as Needle[];
    const initiativesNeedle = initiativesNeedles[0];
    if (!initiativesNeedle) {
      errors.push({
        retriever: 'initiatives',
        message: 'finder returned no needles',
      });
      console.error('  FAIL: finder returned no needles');
    } else {
      console.log('\n[initiatives]');
      const initiativesRecords = await run('initiatives', () =>
        lastValueFrom(
          initiativesRetriever({ ...opts, ...initiativesNeedle }).pipe(
            take(5),
            toArray(),
          ),
        ),
      );
      assert(
        'initiatives',
        initiativesRecords.length >= 1,
        'should emit at least 1 record',
      );
      for (const r of initiativesRecords) {
        const rec = r as Record<string, unknown>;
        assert(
          'initiatives',
          typeof rec['LEGISLATURE'] === 'number',
          'LEGISLATURE should be a number',
        );
        assert(
          'initiatives',
          typeof rec['TIPO'] === 'string' && (rec['TIPO'] as string).length > 0,
          'TIPO should be a non-empty string',
        );
        assert(
          'initiatives',
          typeof rec['TITULO_LEY'] === 'string' &&
            (rec['TITULO_LEY'] as string).length > 0,
          'TITULO_LEY should be a non-empty string',
        );
      }
    }

    // -----------------------------------------------------------------------
    // interest-declarations — hardcoded stable needle
    // -----------------------------------------------------------------------
    console.log('\n[interest-declarations]');
    const interestRecords = await run('interest-declarations', () =>
      lastValueFrom(
        interestDeclarationsRetriever({
          ...opts,
          ...INTEREST_DECLARATIONS_NEEDLE,
        }).pipe(take(5), toArray()),
      ),
    );
    assert(
      'interest-declarations',
      interestRecords.length === 1,
      'should emit exactly 1 record',
    );
    for (const r of interestRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'interest-declarations',
        typeof rec['DEPUTY_ID'] === 'string' &&
          (rec['DEPUTY_ID'] as string).length > 0,
        'DEPUTY_ID should be a non-empty string',
      );
      assert(
        'interest-declarations',
        typeof rec['YEAR'] === 'number',
        'YEAR should be a number',
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
    console.log('All retrievers passed.');
  } else {
    console.error(`${errors.length.toString()} assertion(s) failed:`);
    for (const e of errors) {
      console.error(`  [${e.retriever}] ${e.message}`);
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

**Step 3: Stage (DO NOT commit — parent process will commit)**

```bash
git add apps/ingestion/src/test/retrievers.test.ts
```

**Important codebase rules:**

- All relative imports in `src/` must have `.ts` extension
- Import groups: builtin (`node:*`) → external → internal → parent/sibling →
  type imports
- Blank line between groups; alphabetical within groups
- `import type` for type-only imports
- No default exports

---

### Task 2: Add `test:retrievers` script to package.json

**Files:**

- Modify: `apps/ingestion/package.json`

**Step 1: Add the script**

In `apps/ingestion/package.json`, in the `scripts` object, add after
`test:integration`:

```json
"test:retrievers": "node --import tsx/esm src/test/retrievers.test.ts"
```

**Step 2: Run the tests against the live site (takes a few minutes)**

```bash
pnpm --filter @congress/ingestion test:retrievers
```

Expected output pattern:

```
[person] resolving needle via finder...

[person]
  PASS (Nms) — 5 record(s)

[voting]
  PASS (Nms) — 5 record(s)

[bureau] resolving needle via finder...

[bureau]
  PASS (Nms) — 5 record(s)

[intervention]
  PASS (Nms) — N record(s)

[initiatives] resolving needle via finder...

[initiatives]
  PASS (Nms) — 5 record(s)

[interest-declarations]
  PASS (Nms) — 1 record(s)

---
All retrievers passed.
```

**Step 3: Stage package.json**

```bash
git add apps/ingestion/package.json
```

---

### Task 3: Fix any lint warnings and commit everything

**Step 1: Run strict lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

**Step 2: Fix any reported issues**

Common issues to watch for:

- Import ordering (builtin `node:stream` → external `playwright`/`rxjs` →
  internal, type imports last)
- Missing `.ts` extension on relative imports
- `import type` for type-only imports (e.g. `Needle`)

**Step 3: Commit all changes**

```bash
git add apps/ingestion/src/test/retrievers.test.ts apps/ingestion/package.json
git commit -m "test(ingestion): add retriever integration test runner"
```

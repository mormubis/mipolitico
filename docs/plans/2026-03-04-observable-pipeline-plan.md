# Observable Pipeline Fan-out Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Migrate the ingestion pipeline so finders return `Observable<string>`,
enabling a single finder's URL stream to be multicast via RxJS `share()` to
multiple retriever branches concurrently.

**Architecture:** Finders become `Observable<string>` producers. `main.ts`
applies `share()` to each finder's output and wires branches via `mergeMap` into
retrievers, processors, and sinks. The `Needle` type and `extra` field are
removed entirely; all data fetching moves into retrievers.

**Tech Stack:** RxJS (`Observable`, `from`, `of`, `share`, `merge`, `mergeMap`),
Playwright, TypeScript strict mode, ESM.

---

## Task 1: Update core types

**Files:**

- Modify: `apps/ingestion/src/types.ts`

**Step 1: Replace the type definitions**

Remove `Needle`, `Promisable`, and the `extra`-carrying `RetrieverOptions`.
Replace with:

```ts
import type { Browser } from 'playwright';
import type { Observable, OperatorFunction } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type Finder = (options: CommonOptions) => Observable<string>;

interface RetrieverOptions extends CommonOptions {
  url: string;
}

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type Processor<T, U = T> = OperatorFunction<T, U>;

export type { Finder, Processor, Retriever, RetrieverOptions };
```

**Step 2: Run the type-checker to see all breakage**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | head -80
```

Expected: many errors — every finder and the test files will break. That is the
work list for tasks 2–9.

**Step 3: Commit**

```bash
git add apps/ingestion/src/types.ts
git commit -m "refactor(ingestion): replace Needle with Observable<string> finder type"
```

---

## Task 2: Update `person` finder

**Files:**

- Modify: `apps/ingestion/src/finders/person.ts`

**Step 1: Rewrite to return `Observable<string>`**

```ts
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados');

        const link = await page
          .locator('a[href*=DiputadosActivos][href$=json]')
          .getAttribute('href');

        if (!link) {
          subscriber.error(
            new Error(
              'Could not find link to active deputies JSON data on the congress page',
            ),
          );
          return;
        }

        const url = new URL(link, 'https://www.congreso.es');
        subscriber.next(url.href);
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/person.ts"
```

Expected: no errors for this file.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/person.ts
git commit -m "refactor(ingestion): migrate person finder to Observable<string>"
```

---

## Task 3: Update `bureau` finder

**Files:**

- Modify: `apps/ingestion/src/finders/bureau.ts`

**Step 1: Rewrite to return `Observable<string>`**

```ts
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/organos');

        await Promise.all([
          page.waitForEvent('load'),
          page.getByText('Exportar datos composición').first().click(),
        ]);

        const [request] = await Promise.all([
          page.waitForEvent('requestfinished', { timeout: 3000 }),
          page.getByText('Composición histórica').first().click(),
        ]);

        subscriber.next(request.url());
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/bureau.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/bureau.ts
git commit -m "refactor(ingestion): migrate bureau finder to Observable<string>"
```

---

## Task 4: Update `voting` finder

The `extra: { legislature, session }` is dropped. The watermark filter in
`main.ts` already re-derives these values from the URL string via regex, so
nothing is lost.

**Files:**

- Modify: `apps/ingestion/src/finders/voting.ts`

**Step 1: Rewrite to emit each URL string**

```ts
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/votaciones', {
          waitUntil: 'networkidle',
        });

        const sections = await page.locator('h4[role="button"]').all();
        for (const section of sections) {
          await section.click();
          await page.waitForTimeout(300);
        }

        const jsonLinks = await page.locator('a[href$=".json"]').all();

        for (const link of jsonLinks) {
          const href = await link.getAttribute('href');
          if (href) subscriber.next(href);
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/voting.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/voting.ts
git commit -m "refactor(ingestion): migrate voting finder to Observable<string>"
```

---

## Task 5: Update `initiatives` finder

The `extra: { category }` is dropped. The category name is embedded in the URL
itself (e.g. `IniciativasLegislativasAprobadas`) — any retriever or processor
that needs it can parse it from the URL string.

**Files:**

- Modify: `apps/ingestion/src/finders/initiatives.ts`

**Step 1: Rewrite to emit each URL string**

```ts
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const INITIATIVES_CATEGORIES = [
  'IniciativasLegislativasAprobadas',
  'ProyectosDeLey',
  'PropuestasDeReforma',
  'ProposicionesDeLey',
] as const;

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/iniciativas', {
          waitUntil: 'networkidle',
        });

        for (const category of INITIATIVES_CATEGORIES) {
          const link = await page
            .locator(`a[href*="${category}"][href$="json"]`)
            .first()
            .getAttribute('href');

          if (!link) {
            console.warn(
              `[initiatives] Could not find link for category: ${category}`,
            );
            continue;
          }

          const url = new URL(link, 'https://www.congreso.es');
          subscriber.next(url.href);
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/initiatives.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/initiatives.ts
git commit -m "refactor(ingestion): migrate initiatives finder to Observable<string>"
```

---

## Task 6: Update `person-detail` finder

The `extra: DeputyItem` is dropped. The URL already encodes `codParlamentario`
and `idLegislatura` as query params — the retriever parses them from the URL.

**Files:**

- Modify: `apps/ingestion/src/finders/person-detail.ts`

**Step 1: Rewrite to emit each deputy profile URL as a string**

```ts
import { Observable } from 'rxjs';

import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface DeputyItem {
  apellidos: string;
  apellidosNombre: string;
  codParlamentario: number;
  fchAlta: string;
  fchBaja: string;
  formacion: string;
  genero: number;
  grupo: string;
  idCircunscripcion: number;
  idLegislatura: number;
  nombre: string;
  nombreCircunscripcion: string;
}

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados');

        const searchHref = await page
          .locator('a[href*="busqueda-de-diputados"][href*="statusOpendata"]')
          .first()
          .getAttribute('href');

        if (!searchHref) {
          subscriber.error(
            new Error(
              '[personDetail] Could not find búsqueda personalizada link on opendata/diputados page',
            ),
          );
          return;
        }

        const searchUrl = new URL(searchHref, 'https://www.congreso.es').href;

        const [response] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes('searchDiputados') &&
              r.request().method() === 'POST',
            { timeout: 15000 },
          ),
          page.goto(searchUrl, { waitUntil: 'networkidle' }),
        ]);

        const json = (await response.json()) as { data: DeputyItem[] };

        for (const item of json.data) {
          subscriber.next(
            `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}&mostrarAgenda=false`,
          );
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export type { DeputyItem };
export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/person-detail.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/person-detail.ts
git commit -m "refactor(ingestion): migrate person-detail finder to Observable<string>"
```

---

## Task 7: Update `intervention` finder

The `extra: BulkInterventionRow` is dropped. The watermark filter (date
comparison against `SESION`) moves inside the finder — it already downloads the
bulk JSON, so it can apply the filter before emitting. The
`getLastSuccessfulRun` DB call moves from `main.ts` into the finder.

**Files:**

- Modify: `apps/ingestion/src/finders/intervention.ts`

**Step 1: Rewrite — move date filter inside, emit URL strings only**

```ts
import { getLastSuccessfulRun } from '@congress/database';
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date {
  const parts = ddmmyyyy.split('/');
  const dd = parts[0] ?? '01';
  const mm = parts[1] ?? '01';
  const yyyy = parts[2] ?? '1970';
  const date = new Date(`${yyyy}-${mm}-${dd}`);

  if (isNaN(date.getTime())) {
    console.warn(`[intervention] Could not parse date: ${ddmmyyyy}`);
    return new Date(0);
  }

  return date;
}

interface BulkInterventionRow {
  LEGISLATURA: string;
  OBJETOINICIATIVA: string;
  SESION: string; // DD/MM/YYYY
  ORGANO: string;
  FASE: string;
  TIPOINTERVENCION: string;
  ORADOR: string;
  CARGOORADOR: string;
  INICIOINTERVENCION: string;
  FININTERVENCION: string;
  ENLACEDIFERIDO: string;
  ENLACEDESCARGADIRECTA: string;
  ENLACETEXTOINTEGRO: string;
  ENLACEPDF: string;
}

const finder: Finder = ({ browser, fetch }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        const lastRun = await getLastSuccessfulRun('intervention');
        const dateFrom = lastRun ?? LEGISLATURE_XV_START;

        await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
          waitUntil: 'networkidle',
        });

        const href = await page
          .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
          .first()
          .getAttribute('href');

        if (!href) {
          subscriber.error(
            new Error(
              '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
            ),
          );
          return;
        }

        const url = new URL(href, 'https://www.congreso.es').href;
        const response = await fetch(url);

        if (!response.ok) {
          subscriber.error(
            new Error(
              `[intervention] Failed to fetch bulk JSON: ${response.status.toString()} ${response.statusText}`,
            ),
          );
          return;
        }

        const rows = (await response.json()) as BulkInterventionRow[];
        const seen = new Set<string>();
        let emitted = 0;

        for (const row of rows) {
          if (!row.ENLACETEXTOINTEGRO) continue;
          if (seen.has(row.ENLACETEXTOINTEGRO)) continue;
          if (parseSpanishDate(row.SESION) <= dateFrom) continue;

          seen.add(row.ENLACETEXTOINTEGRO);
          subscriber.next(row.ENLACETEXTOINTEGRO);
          emitted++;
        }

        console.log(
          `[intervention] Emitted ${String(emitted)} unique session URLs`,
        );
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export type { BulkInterventionRow };
export { finder };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/intervention.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/intervention.ts
git commit -m "refactor(ingestion): migrate intervention finder to Observable<string>, move date filter inside"
```

---

## Task 8: Update `interest-declarations` finder

This is the biggest simplification. Drop the active-deputy join entirely. The
finder emits a single string — the `docacteco` JSON URL. The retriever will own
grouping by name and PDF scraping.

**Files:**

- Modify: `apps/ingestion/src/finders/interest-declarations.ts`

**Step 1: Rewrite as a single-URL finder**

```ts
import { Observable } from 'rxjs';

import type { Finder } from '../types.ts';

const finder: Finder = ({ browser }) =>
  new Observable<string>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto('https://www.congreso.es/es/opendata/diputados');

        const href = await page
          .locator('a[href*="docacteco"][href$="json"]')
          .first()
          .getAttribute('href');

        if (!href) {
          subscriber.error(
            new Error(
              '[interestDeclarations] Could not find docacteco JSON link',
            ),
          );
          return;
        }

        const url = new URL(href, 'https://www.congreso.es').href;
        subscriber.next(url);
        subscriber.complete();
      } catch (cause) {
        subscriber.error(cause);
      } finally {
        await page.close();
      }
    })();
  });

export { finder };
```

Note: `BulkDeclarationRow` and `InterestDeclarationsNeedleExtra` move to the
retriever in the next task.

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "finders/interest-declarations.ts"
```

Expected: no errors for this file (the retriever will still error — handled
next).

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/interest-declarations.ts
git commit -m "refactor(ingestion): simplify interest-declarations finder to single URL emitter"
```

---

## Task 9: Update `interest-declarations` retriever

The retriever now owns what the finder used to do: fetch the bulk JSON, group
rows by `NOMBRE`, and for each deputy navigate to a search URL to scrape the
PDF. `DEPUTY_ID` becomes the normalised name string (no active-deputy lookup).

**Files:**

- Modify: `apps/ingestion/src/retrievers/interest-declarations.ts`

**Step 1: Rewrite the retriever**

```ts
import { Observable } from 'rxjs';

import { random } from '../utils.ts';

import type { Retriever } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

interface BulkDeclarationRow {
  NOMBRE: string;
  FECHAREGISTRO: string;
  DECLARACION: string;
  TIPO: string;
  PERIODO: string;
  EMPLEADOR: string;
  SECTOR: string;
  DESCRIPCION: string;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePeriodToDate(year: string): string {
  return `${year.trim()}-01-01`;
}

function parsePeriod(periodo: string): {
  startDate?: string;
  endDate?: string;
} {
  const parts = periodo
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 || parts[0] === undefined) return {};
  if (parts.length === 1) return { startDate: parsePeriodToDate(parts[0]) };

  const last = parts[parts.length - 1];

  return {
    startDate: parsePeriodToDate(parts[0]),
    endDate: last !== undefined ? parsePeriodToDate(last) : undefined,
  };
}

function mapActivities(
  rows: BulkDeclarationRow[],
): NonNullable<InterestDeclarationInput['PROFESSIONAL_ACTIVITIES']> {
  return rows
    .filter((r) => r.TIPO === 'ACTIVIDAD')
    .map((r) => ({
      entity: r.EMPLEADOR,
      position: r.DESCRIPCION,
      remunerated: r.SECTOR !== 'PÚBLICO',
      ...parsePeriod(r.PERIODO),
    }));
}

const retriever: Retriever<InterestDeclarationInput> = ({
  browser,
  fetch,
  url,
}) =>
  new Observable((subscriber) => {
    void (async () => {
      try {
        // Download the bulk declarations JSON
        const response = await fetch(url);

        if (!response.ok) {
          subscriber.error(
            new Error(
              `[interestDeclarations] Failed to fetch docacteco JSON: ${response.status.toString()} ${response.statusText}`,
            ),
          );
          return;
        }

        const rows = (await response.json()) as BulkDeclarationRow[];

        // Group rows by normalised NOMBRE
        const rowsByName = new Map<string, BulkDeclarationRow[]>();
        for (const row of rows) {
          const key = normalizeName(row.NOMBRE);
          const existing = rowsByName.get(key) ?? [];
          existing.push(row);
          rowsByName.set(key, existing);
        }

        console.log(
          `[interestDeclarations] Processing ${String(rowsByName.size)} deputies`,
        );

        // For each deputy group, scrape their profile page for the PDF URL
        for (const [normalizedName, deputyRows] of rowsByName) {
          const page = await browser.newPage();

          try {
            // Use a name-based search URL
            const searchUrl = `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=S&nombre=${encodeURIComponent(normalizedName)}`;

            await page.goto(searchUrl);

            const pdfUrl = await page
              .getByText('Declaración de Intereses Económicos')
              .first()
              .getAttribute('href', { timeout: random(1000, 3000) })
              .catch(() => undefined);

            const activities = mapActivities(deputyRows);

            subscriber.next({
              DEPUTY_ID: normalizedName,
              PDF_URL: pdfUrl ?? undefined,
              PROFESSIONAL_ACTIVITIES:
                activities.length > 0 ? activities : undefined,
              YEAR: new Date().getFullYear(),
            });
          } catch (cause) {
            console.warn(
              `[interestDeclarations] Failed to scrape profile for ${normalizedName}: ${(cause as Error).message}`,
            );
          } finally {
            await page.close().catch(() => undefined);
          }
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(
            `[interestDeclarations] Failed: ${(cause as Error).message}`,
            { cause },
          ),
        );
      }
    })();
  });

export type { BulkDeclarationRow };
export { retriever };
```

**Step 2: Check types**

```bash
pnpm --filter @congress/ingestion lint:types 2>&1 | grep "retrievers/interest-declarations.ts"
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/retrievers/interest-declarations.ts
git commit -m "refactor(ingestion): move declaration grouping and PDF scraping into interest-declarations retriever"
```

---

## Task 10: Rewrite `main.ts`

Replace the six `run*Pipeline()` functions with a declarative graph and a single
generic `runPipeline` function using `share()` for finder multicast.

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Rewrite `main.ts`**

```ts
import {
  getExistingSessionKeys,
  prisma,
  updateScraperMetadata,
} from '@congress/database';
import { lastValueFrom, merge, mergeMap, filter, retry, share } from 'rxjs';

import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { finder as interestDeclarationsFinder } from './finders/interest-declarations.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { fetch, launch } from './network/index.ts';
import { processor as interestDeclarationsProcessor } from './processors/interest-declarations.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interest-declarations.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';
import {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';

import type { CommonOptions, Finder, Retriever } from './types.ts';
import type { OperatorFunction } from 'rxjs';

type Branch<T> = [Retriever<T>, ...OperatorFunction<T, unknown>[]];

interface PipelineEntry {
  name: string;
  finder: Finder;
  branches: Branch<never>[];
  urlFilter?: (url: string) => boolean | Promise<boolean>;
}

async function runPipeline(
  entry: PipelineEntry,
  options: CommonOptions,
): Promise<void> {
  const urlFilter = entry.urlFilter;

  const urls$ = entry.finder(options).pipe(
    urlFilter
      ? filter((url) => {
          const result = urlFilter(url);
          return typeof result === 'boolean' ? result : true;
        })
      : (x) => x,
    share(),
  );

  if (entry.branches.length === 0) {
    await lastValueFrom(urls$, { defaultValue: undefined });
    return;
  }

  const branchStreams = entry.branches.map(([retriever, ...ops]) => {
    let stream = urls$.pipe(
      mergeMap((url) =>
        retriever({ url, ...options }).pipe(
          retry({ delay: 15 * 1000, count: 1 }),
        ),
      ),
    );
    for (const op of ops) {
      stream = stream.pipe(op as OperatorFunction<unknown, unknown>);
    }
    return stream;
  });

  await lastValueFrom(merge(...branchStreams));
}

// ---------------------------------------------------------------------------
// Watermark helpers
// ---------------------------------------------------------------------------

async function buildVotingFilter(): Promise<(url: string) => boolean> {
  const existingKeys = await getExistingSessionKeys();
  return (url: string) => {
    const match = /Leg(\d+)\/Sesion(\d+)/.exec(url);
    if (!match) return true;
    const leg = match[1];
    const sess = match[2];
    if (!leg || !sess) return true;
    const key = `${leg}-${parseInt(sess, 10).toString()}`;
    return !existingKeys.has(key);
  };
}

// ---------------------------------------------------------------------------
// Pipeline runners
// ---------------------------------------------------------------------------

async function runPersonPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'deputies',
        finder: personFinder,
        branches: [[personRetriever, persistDeputies()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('deputies', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('deputies', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runVotingPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    const urlFilter = await buildVotingFilter();
    await runPipeline(
      {
        name: 'voting',
        finder: votingFinder,
        branches: [[votingRetriever, persistVotes()]],
        urlFilter,
      },
      { browser, fetch },
    );
    await updateScraperMetadata('voting', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('voting', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runBureauPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'bureau',
        finder: bureauFinder,
        branches: [[bureauRetriever, persistOrganMembers()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('bureau', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('bureau', false, message).catch(console.error);
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInterventionPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'intervention',
        finder: interventionFinder,
        branches: [[interventionRetriever, persistSpeeches()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('intervention', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('intervention', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInitiativesPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'initiatives',
        finder: initiativesFinder,
        branches: [[initiativesRetriever, persistInitiatives()]],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('initiatives', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('initiatives', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

async function runInterestDeclarationsPipeline(): Promise<void> {
  const browser = await launch({ headless: true });
  try {
    await runPipeline(
      {
        name: 'interestDeclarations',
        finder: interestDeclarationsFinder,
        branches: [
          [
            interestDeclarationsRetriever,
            interestDeclarationsProcessor,
            persistInterestDeclarations(),
          ],
        ],
      },
      { browser, fetch },
    );
    await updateScraperMetadata('interestDeclarations', true);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await updateScraperMetadata('interestDeclarations', false, message).catch(
      console.error,
    );
    throw error;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const sourceArg = process.argv
  .find((arg) => arg.startsWith('--source='))
  ?.replace('--source=', '');

const pipelines: Record<string, () => Promise<void>> = {
  bureau: runBureauPipeline,
  initiatives: runInitiativesPipeline,
  interestDeclarations: runInterestDeclarationsPipeline,
  intervention: runInterventionPipeline,
  person: runPersonPipeline,
  voting: runVotingPipeline,
};

async function main(): Promise<void> {
  if (!sourceArg || sourceArg === 'all') {
    console.log('[main] Running all pipelines sequentially');
    for (const [name, run] of Object.entries(pipelines)) {
      console.log(`[main] Starting ${name} pipeline`);
      await run();
      console.log(`[main] Finished ${name} pipeline`);
    }
    return;
  }

  const run = pipelines[sourceArg];
  if (!run) {
    console.error(
      `[main] Unknown source: "${sourceArg}". Valid: ${Object.keys(pipelines).join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  await run();
}

void main().catch((error: unknown) => {
  console.error('[main] Fatal error:', error);
  process.exitCode = 1;
});

export {
  runBureauPipeline,
  runInitiativesPipeline,
  runInterestDeclarationsPipeline,
  runInterventionPipeline,
  runPersonPipeline,
  runVotingPipeline,
};
```

**Step 2: Check types across the whole package**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

**Step 3: Run linter**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors, no warnings.

**Step 4: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit -m "refactor(ingestion): rewrite main.ts with share()-based pipeline graph"
```

---

## Task 11: Update integration tests

Both test files reference `Needle`, `extra`, and the old finder return shapes.
Update them to match the new `Observable<string>` interface.

**Files:**

- Modify: `apps/ingestion/src/test/finders.test.ts`
- Modify: `apps/ingestion/src/test/retrievers.test.ts`

**Step 1: Rewrite `finders.test.ts`**

The test helper `normalise` and the `Needle` type are removed. Each finder now
returns `Observable<string>` — collect all emitted strings via `lastValueFrom` +
`toArray`.

```ts
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
```

**Step 2: Update `retrievers.test.ts`**

Remove the `Needle` import, `firstNeedle` helper, and `runFinder` helper.
Finders now return `Observable<string>` — take the first emitted value with
`firstValueFrom`.

- Replace `import type { Needle } from '../types.ts'` → remove.
- Replace `firstNeedle(await fn())` calls with `firstValueFrom(finderFn(opts))`
  using `import { firstValueFrom } from 'rxjs'`.
- Replace the hardcoded `INTEREST_DECLARATIONS_NEEDLE` (which had `extra`) with
  a plain string URL:
  ```ts
  const INTEREST_DECLARATIONS_URL =
    'https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&...';
  ```
  And pass it as `{ ...opts, url: INTEREST_DECLARATIONS_URL }` to the retriever.
- Update retriever calls: `retriever({ ...opts, ...needle })` becomes
  `retriever({ ...opts, url })`.
- Remove the `runFinder` function entirely.

**Step 3: Check types**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

**Step 4: Run linter**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors, no warnings.

**Step 5: Commit**

```bash
git add apps/ingestion/src/test/
git commit -m "refactor(ingestion): update integration tests for Observable<string> finder interface"
```

---

## Task 12: Final verification

**Step 1: Full type-check**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: zero errors.

**Step 2: Full lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: zero errors, zero warnings.

**Step 3: Build**

```bash
pnpm --filter @congress/ingestion build
```

Expected: successful compilation.

**Step 4: Commit if anything was fixed**

If steps 1–3 required any fixes, commit them:

```bash
git add -A
git commit -m "fix(ingestion): address lint/type errors after Observable migration"
```

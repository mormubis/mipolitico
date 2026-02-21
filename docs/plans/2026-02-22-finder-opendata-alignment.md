# Finder Opendata Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Rewrite `intervention` and `personDetail` finders to start from the
opendata pages, and add a dedicated `interestDeclarations` finder that uses the
bulk `docacteco` JSON to supply structured data alongside the PDF URL.

**Architecture:** Three finder files are changed/added. The intervention finder
replaces a 200-page pagination loop with a single bulk JSON fetch + date-filter.
The personDetail finder replaces a hardcoded internal API POST with a fetch of
the `DiputadosActivos` JSON discovered from the opendata page. A new
interestDeclarations finder navigates the same opendata page, fetches both
`DiputadosActivos` and `docacteco` JSONs, matches deputies by name, and emits
needles carrying structured declaration rows. The interestDeclarations retriever
is updated to read structured rows from `extra` and supplement with a PDF URL
from the profile page.

**Tech Stack:** TypeScript ESM, Playwright (browser navigation for opendata
pages), native `fetch` (JSON downloads), RxJS Observables, Zod validation,
Prisma/SQLite via `@congress/database`.

---

## Task 1: Rewrite `finders/intervention.ts`

**Files:**

- Modify: `apps/ingestion/src/finders/intervention.ts`

**Context:**

Current file paginates through a search UI with a hardcoded legislature code.
New approach: navigate `opendata/intervenciones`, pick the
`IntervencionesCronologicamente` JSON link, fetch it, apply date watermark,
deduplicate by `ENLACETEXTOINTEGRO`.

The bulk JSON shape (one item):

```json
{
  "LEGISLATURA": "Leg.15",
  "OBJETOINICIATIVA": "...",
  "SESION": "17/08/2023",
  "ORGANO": "Pleno",
  "FASE": "...",
  "TIPOINTERVENCION": "Intervención",
  "ORADOR": "...",
  "CARGOORADOR": "Diputada",
  "INICIOINTERVENCION": "14:09",
  "FININTERVENCION": "14:10",
  "ENLACEDIFERIDO": "https://...",
  "ENLACEDESCARGADIRECTA": "https://...",
  "ENLACETEXTOINTEGRO": "https://www.congreso.es/busqueda-de-intervenciones?...",
  "ENLACEPDF": "https://..."
}
```

The date watermark uses `getLastSuccessfulRun('intervention')` from
`@congress/database` (same as today). Fall back to `new Date('2024-01-01')`.
`SESION` is `DD/MM/YYYY` — parse it to a `Date` for comparison.

Deduplication: the same `ENLACETEXTOINTEGRO` URL appears once per speaker on a
shared session page. Use a `Set` to emit each URL only once.

**Step 1: Replace the file contents**

```ts
import { getLastSuccessfulRun } from '@congress/database';

import type { Finder, Needle } from '../types.ts';

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

const LEGISLATURE_XV_START = new Date('2024-01-01');

function parseSpanishDate(ddmmyyyy: string): Date {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return new Date(`${yyyy}-${mm}-${dd}`);
}

const finder: Finder = async ({ browser, fetch }) => {
  const lastRun = await getLastSuccessfulRun('intervention');
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;

  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/intervenciones', {
      waitUntil: 'networkidle',
    });

    const href = await page
      .locator('a[href*="IntervencionesCronologicamente"][href$="json"]')
      .first()
      .getAttribute('href');

    if (!href) {
      throw new Error(
        '[intervention] Could not find IntervencionesCronologicamente JSON link on opendata page',
      );
    }

    const url = new URL(href, 'https://www.congreso.es').href;

    const response = await fetch(url);
    const rows = (await response.json()) as BulkInterventionRow[];

    const seen = new Set<string>();
    const needles: Needle[] = [];

    for (const row of rows) {
      const sessionDate = parseSpanishDate(row.SESION);

      if (sessionDate <= dateFrom) continue;
      if (!row.ENLACETEXTOINTEGRO) continue;
      if (seen.has(row.ENLACETEXTOINTEGRO)) continue;

      seen.add(row.ENLACETEXTOINTEGRO);
      needles.push({ url: row.ENLACETEXTOINTEGRO, extra: row });
    }

    console.log(
      `[intervention] Found ${String(needles.length)} unique session pages after ${dateFrom.toISOString().slice(0, 10)}`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkInterventionRow };
export { finder };
```

**Step 2: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/intervention.ts
git commit -m "refactor(ingestion): rewrite intervention finder to use opendata bulk JSON"
```

---

## Task 2: Rewrite `finders/personDetail.ts`

**Files:**

- Modify: `apps/ingestion/src/finders/personDetail.ts`

**Context:**

Current file POSTs to an internal API endpoint. New approach: navigate
`opendata/diputados`, find the `DiputadosActivos` JSON link (same one
`person.ts` uses), fetch it, map to profile page needles.

The `DiputadosActivos` JSON shape (one item):

```json
{
  "apellidos": "...",
  "apellidosNombre": "Apellidos, Nombre",
  "codParlamentario": 123,
  "fchAlta": "...",
  "fchBaja": "...",
  "formacion": "PP",
  "genero": 1,
  "grupo": "GP Popular en el Congreso",
  "idCircunscripcion": 28,
  "idLegislatura": 15,
  "nombre": "Nombre",
  "nombreCircunscripcion": "Madrid"
}
```

Profile page URL construction is identical to today:

```
https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario={cod}&idLegislatura={roman}&mostrarAgenda=false
```

The `romanize` utility is in `../utils.ts`.

**Step 1: Replace the file contents**

```ts
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

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/diputados');

    const href = await page
      .locator('a[href*="DiputadosActivos"][href$="json"]')
      .first()
      .getAttribute('href');

    if (!href) {
      throw new Error(
        'Could not find DiputadosActivos JSON link on opendata/diputados page',
      );
    }

    const url = new URL(href, 'https://www.congreso.es').href;
    const response = await fetch(url);
    const deputies = (await response.json()) as DeputyItem[];

    return deputies.map((item) => ({
      url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}&mostrarAgenda=false`,
      extra: item,
    }));
  } finally {
    await page.close();
  }
};

export type { DeputyItem };
export { finder };
```

**Step 2: Check that `retrievers/personDetail.ts` still compiles**

The retriever imports `APIDeputyItem` from `../finders/personDetail.ts`. That
export is being renamed to `DeputyItem`. Update the retriever's import:

In `apps/ingestion/src/retrievers/personDetail.ts`, change:

```ts
// old
import type { APIDeputyItem } from '../finders/personDetail.ts';
// ...
const deputy = extra as APIDeputyItem;
```

to:

```ts
// new
import type { DeputyItem } from '../finders/personDetail.ts';
// ...
const deputy = extra as DeputyItem;
```

**Step 3: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 4: Commit**

```bash
git add apps/ingestion/src/finders/personDetail.ts \
        apps/ingestion/src/retrievers/personDetail.ts
git commit -m "refactor(ingestion): rewrite personDetail finder to use opendata DiputadosActivos JSON"
```

---

## Task 3: Add `finders/interestDeclarations.ts`

**Files:**

- Create: `apps/ingestion/src/finders/interestDeclarations.ts`

**Context:**

This new finder navigates `opendata/diputados` and discovers both:

- `DiputadosActivos` JSON link → deputy list with `codParlamentario`
- `docacteco` JSON link → structured declaration rows

It groups `docacteco` rows by `NOMBRE`, matches each group to a deputy via a
normalized name lookup, and emits one `Needle` per matched deputy.

The needle `url` is the same profile page URL as `personDetail` uses. The
`extra` payload is:

```ts
{
  codParlamentario: number;
  idLegislatura: number;
  declarations: BulkDeclarationRow[];
}
```

Name normalization: lowercase, collapse whitespace, remove commas. Both
`apellidosNombre` and the `docacteco` `NOMBRE` are `"Apellidos,Nombre"` or
`"Apellidos, Nombre"` — normalize both the same way before matching.

`BulkDeclarationRow` shape:

```ts
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
```

**Step 1: Write the new file**

```ts
import { romanize } from '../utils.ts';

import type { DeputyItem } from './personDetail.ts';
import type { Finder, Needle } from '../types.ts';

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

interface InterestDeclarationsNeedleExtra {
  codParlamentario: number;
  idLegislatura: number;
  declarations: BulkDeclarationRow[];
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

const finder: Finder = async ({ browser, fetch }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/diputados');

    const [deputiesHref, declarationsHref] = await Promise.all([
      page
        .locator('a[href*="DiputadosActivos"][href$="json"]')
        .first()
        .getAttribute('href'),
      page
        .locator('a[href*="docacteco"][href$="json"]')
        .first()
        .getAttribute('href'),
    ]);

    if (!deputiesHref) {
      throw new Error(
        '[interestDeclarations] Could not find DiputadosActivos JSON link',
      );
    }

    if (!declarationsHref) {
      throw new Error(
        '[interestDeclarations] Could not find docacteco JSON link',
      );
    }

    const [deputies, declarations] = await Promise.all([
      fetch(new URL(deputiesHref, 'https://www.congreso.es').href).then(
        (r) => r.json() as Promise<DeputyItem[]>,
      ),
      fetch(new URL(declarationsHref, 'https://www.congreso.es').href).then(
        (r) => r.json() as Promise<BulkDeclarationRow[]>,
      ),
    ]);

    // Build lookup: normalized name → deputy
    const deputyByName = new Map<string, DeputyItem>();
    for (const deputy of deputies) {
      deputyByName.set(normalizeName(deputy.apellidosNombre), deputy);
    }

    // Group declaration rows by NOMBRE
    const rowsByName = new Map<string, BulkDeclarationRow[]>();
    for (const row of declarations) {
      const key = normalizeName(row.NOMBRE);
      const existing = rowsByName.get(key) ?? [];
      existing.push(row);
      rowsByName.set(key, existing);
    }

    const needles: Needle[] = [];

    for (const [normalizedName, rows] of rowsByName) {
      const deputy = deputyByName.get(normalizedName);

      if (!deputy) {
        console.warn(
          `[interestDeclarations] No deputy match for: ${rows[0]?.NOMBRE ?? normalizedName}`,
        );
        continue;
      }

      const extra: InterestDeclarationsNeedleExtra = {
        codParlamentario: deputy.codParlamentario,
        idLegislatura: deputy.idLegislatura,
        declarations: rows,
      };

      needles.push({
        url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${deputy.codParlamentario.toString()}&idLegislatura=${romanize(deputy.idLegislatura)}&mostrarAgenda=false`,
        extra,
      });
    }

    console.log(
      `[interestDeclarations] ${String(needles.length)} deputies matched out of ${String(rowsByName.size)} declaration groups`,
    );

    return needles;
  } finally {
    await page.close();
  }
};

export type { BulkDeclarationRow, InterestDeclarationsNeedleExtra };
export { finder };
```

**Step 2: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/finders/interestDeclarations.ts
git commit -m "feat(ingestion): add interestDeclarations finder using opendata bulk JSON"
```

---

## Task 4: Update `retrievers/interestDeclarations.ts`

**Files:**

- Modify: `apps/ingestion/src/retrievers/interestDeclarations.ts`

**Context:**

Current retriever delegates entirely to `personDetailRetriever` and picks
`DECLARACION_BIENES_URL` as the PDF. New retriever:

1. Reads `extra` as `InterestDeclarationsNeedleExtra`
2. Visits the profile page to extract `DECLARACION_INTERESES_URL` only
3. Maps `TIPO === 'ACTIVIDAD'` rows from `extra.declarations` to
   `PROFESSIONAL_ACTIVITIES`
4. Emits a single `InterestDeclarationInput`

The `InterestDeclarationInput` schema (from `@congress/database`):

```ts
{
  DEPUTY_ID: string;              // String(codParlamentario)
  PDF_URL?: string;               // DECLARACION_INTERESES_URL from profile page
  YEAR: number;                   // current year
  PROFESSIONAL_ACTIVITIES?: Array<{
    entity: string;               // EMPLEADOR
    position: string;             // DESCRIPCION
    remunerated: boolean;         // SECTOR !== 'PÚBLICO'
    startDate?: string;           // parsed from PERIODO (first year)
    endDate?: string;             // parsed from PERIODO (last year, if range)
  }>;
  // BANK_ACCOUNTS, INCOME_SOURCES, MOVABLE_ASSETS, REAL_ESTATE, SECURITIES
  // left undefined — not present in bulk JSON
}
```

`PERIODO` format is either a single year (`"2018"`) or a range (`"2018-2021"`).
Parse to ISO date strings (`"2018-01-01"`).

The profile page link selector:
`getByText('Declaración de Intereses Económicos').first().getAttribute('href')`
— same as today's retriever uses. Wrap in a `.catch(() => undefined)` in case
the link is absent.

**Step 1: Replace the file contents**

```ts
import { Observable } from 'rxjs';

import type { InterestDeclarationInput } from '@congress/database';
import type {
  BulkDeclarationRow,
  InterestDeclarationsNeedleExtra,
} from '../finders/interestDeclarations.ts';
import type { Retriever } from '../types.ts';

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

  if (parts.length === 0) return {};
  if (parts.length === 1) return { startDate: parsePeriodToDate(parts[0]!) };

  return {
    startDate: parsePeriodToDate(parts[0]!),
    endDate: parsePeriodToDate(parts[parts.length - 1]!),
  };
}

function mapActivities(
  rows: BulkDeclarationRow[],
): InterestDeclarationInput['PROFESSIONAL_ACTIVITIES'] {
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
  extra,
  url,
}) => {
  return new Observable((subscriber) => {
    void (async () => {
      const needleExtra = extra as InterestDeclarationsNeedleExtra;
      const page = await browser.newPage();

      try {
        await page.goto(url);

        const pdfUrl = await page
          .getByText('Declaración de Intereses Económicos')
          .first()
          .getAttribute('href')
          .catch(() => undefined);

        const activities = mapActivities(needleExtra.declarations);

        subscriber.next({
          DEPUTY_ID: String(needleExtra.codParlamentario),
          PDF_URL: pdfUrl ?? undefined,
          PROFESSIONAL_ACTIVITIES:
            activities.length > 0 ? activities : undefined,
          YEAR: new Date().getFullYear(),
        });

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(
            `Unable to retrieve interest declaration from ${url}: ${(cause as Error).message}`,
            { cause },
          ),
        );
      } finally {
        await page.close();
      }
    })();
  });
};

export { retriever };
```

**Step 2: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/ingestion/src/retrievers/interestDeclarations.ts
git commit -m "refactor(ingestion): update interestDeclarations retriever to use structured bulk data"
```

---

## Task 5: Update `main.ts`

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Context:**

`runInterestDeclarationsPipeline` currently uses `personDetailFinder`. Replace
with the new `interestDeclarationsFinder`. The pipeline body is otherwise
identical.

Also remove the now-unused `personDetailFinder` import from this pipeline
function (it's still used by `runPersonDetailPipeline` if that exists — check
first; if `personDetailFinder` is only imported for the interest declarations
pipeline, remove the import entirely).

**Step 1: Add the new finder import**

In the import block, add:

```ts
import { finder as interestDeclarationsFinder } from './finders/interestDeclarations.ts';
```

**Step 2: Update `runInterestDeclarationsPipeline`**

Replace:

```ts
const needles = await findAll(personDetailFinder, { browser, fetch });

if (needles.length === 0) {
  console.log('[interestDeclarations] No deputies found, skipping');
```

With:

```ts
const needles = await findAll(interestDeclarationsFinder, { browser, fetch });

if (needles.length === 0) {
  console.log('[interestDeclarations] No deputies found, skipping');
```

**Step 3: Remove unused import**

Check if `personDetailFinder` is used anywhere else in `main.ts`. If not, remove
its import line:

```ts
// remove this line if unused:
import { finder as personDetailFinder } from './finders/personDetail.ts';
```

**Step 4: Run lint**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors.

**Step 5: Commit**

```bash
git add apps/ingestion/src/main.ts
git commit -m "refactor(ingestion): wire interestDeclarations finder in pipeline"
```

---

## Task 6: Smoke test

**Context:**

No automated tests exist for ingestion. Verify the rewrites work end-to-end by
running each affected pipeline in dry-run style (just the finder, not the full
pipeline to DB).

**Step 1: Verify intervention finder resolves needles**

Add a temporary script at the repo root or run inline:

```bash
node --import tsx/esm -e "
import { launch } from './apps/ingestion/src/network/index.ts';
import { fetch } from './apps/ingestion/src/network/index.ts';
import { finder } from './apps/ingestion/src/finders/intervention.ts';
const browser = await launch({ headless: true });
try {
  const needles = await finder({ browser, fetch });
  console.log('intervention needles:', needles.length);
  console.log('sample:', JSON.stringify(needles[0], null, 2));
} finally {
  await browser.close();
}
"
```

Expected: prints a count > 0 and a sample needle with a `url` pointing to
`busqueda-de-intervenciones` and `extra.ORADOR` populated.

**Step 2: Verify interestDeclarations finder resolves needles**

```bash
node --import tsx/esm -e "
import { launch } from './apps/ingestion/src/network/index.ts';
import { fetch } from './apps/ingestion/src/network/index.ts';
import { finder } from './apps/ingestion/src/finders/interestDeclarations.ts';
const browser = await launch({ headless: true });
try {
  const needles = await finder({ browser, fetch });
  console.log('interestDeclarations needles:', needles.length);
  console.log('sample extra:', JSON.stringify(needles[0]?.extra, null, 2));
} finally {
  await browser.close();
}
"
```

Expected: prints a count > 0, sample `extra` has `codParlamentario`,
`idLegislatura`, and `declarations` array with at least one row.

**Step 3: Commit nothing** — smoke test is manual verification only.

---

## Notes

- The `processors/interestDeclarations.ts` identity processor is unchanged; it
  remains a placeholder for future PDF extraction.
- The `personDetail.ts` retriever is unchanged in behaviour — only the import
  type name changes (`APIDeputyItem` → `DeputyItem`).
- Name matching between `docacteco` NOMBRE and `DiputadosActivos`
  apellidosNombre is best-effort. Unmatched names are warned and skipped; they
  will not cause pipeline failure.

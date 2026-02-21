# Ingestion Pipelines Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Refactor `sources/` into flat `finders/` + `retrievers/` +
`processors/` directories, then add initiatives and interest declarations
pipelines.

**Architecture:** Three commits — (1) refactor existing sources into separate
finder/retriever files, (2) add initiatives pipeline, (3) add interest
declarations pipeline. Each pipeline follows the pattern
`finder → retriever → [processor?] → sink` wired together in `main.ts`.

**Tech Stack:** TypeScript (strict ESM), RxJS Observables, Playwright, oboe
(streaming JSON), Zod, Prisma, pnpm workspaces, Nx.

---

## Commit 1 — Refactor: split `sources/` into `finders/` + `retrievers/`

### Task 1: Move and update shared types

**Files:**

- Create: `apps/ingestion/src/types.ts`
- Delete: `apps/ingestion/src/sources/types.ts` (at end of commit)

**Step 1: Create `apps/ingestion/src/types.ts`**

Add the `Processor` type alongside the existing types. Copy verbatim from
`sources/types.ts`, then add `Processor`:

```ts
import type { Browser } from 'playwright';
import type { Observable, OperatorFunction } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type FinderOptions = CommonOptions;

type Finder = (
  options: FinderOptions,
) => Promisable<string | string[] | Needle[]>;

interface Needle {
  url: string;
  extra?: unknown;
}

type Promisable<T> = T | Promise<T>;

type RetrieverOptions = CommonOptions & Needle;

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type SourceOptions = CommonOptions;

type Source<T> = (options: SourceOptions) => Observable<T>;

type Processor<T, U = T> = OperatorFunction<T, U>;

export type { Finder, Needle, Processor, Retriever, Source };
```

**Step 2: Verify lint passes**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors (file not yet imported anywhere).

---

### Task 2: Split `sources/person.ts`

**Files:**

- Create: `apps/ingestion/src/finders/person.ts`
- Create: `apps/ingestion/src/retrievers/person.ts`

**Step 1: Create `apps/ingestion/src/finders/person.ts`**

```ts
import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('https://www.congreso.es/es/opendata/diputados');

  const link = await page
    .locator('a[href*=DiputadosActivos][href$=json]')
    .getAttribute('href');

  if (!link) {
    throw new Error(
      'Could not find link to active deputies JSON data on the congress page',
    );
  }

  const url = new URL(link, 'https://www.congreso.es');

  await page.close();

  return url.href;
};

export { finder };
```

**Step 2: Create `apps/ingestion/src/retrievers/person.ts`**

```ts
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  BIOGRAFIA: z.string(),
  CIRCUNSCRIPCION: z.string(),
  FECHAALTA: z.string(),
  FECHAALTAENGRUPOPARLAMENTARIO: z.string(),
  FECHACONDICIONPLENA: z.string(),
  FORMACIONELECTORAL: z.string(),
  GRUPOPARLAMENTARIO: z.string(),
  NOMBRE: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch person data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from person data endpoint',
          );
        }

        oboe(Readable.fromWeb(response.body))
          .node('!.*', (item) => {
            subscriber.next(item as Model);
          })
          .done(() => {
            subscriber.complete();
          })
          .fail((error) => {
            subscriber.error(error);
          });
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
```

---

### Task 3: Split `sources/bureau.ts`

**Files:**

- Create: `apps/ingestion/src/finders/bureau.ts`
- Create: `apps/ingestion/src/retrievers/bureau.ts`

**Step 1: Create `apps/ingestion/src/finders/bureau.ts`**

```ts
import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('https://www.congreso.es/es/opendata/organos');

  await Promise.all([
    page.waitForEvent('load'),
    page.getByText('Exportar datos composición').first().click(),
  ]);

  const [request] = await Promise.all([
    page.waitForEvent('requestfinished', { timeout: 3000 }),
    page.getByText('Composición histórica').first().click(),
  ]);

  const url = request.url();

  await page.close();

  return url;
};

export { finder };
```

**Step 2: Create `apps/ingestion/src/retrievers/bureau.ts`**

```ts
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  Cargo: z.string(),
  FechaAlta: z.string(),
  FechaBaja: z.string(),
  Grupo: z.string(),
  Nombre: z.string(),
  NombreOrgano: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url, { method: 'POST' });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch bureau data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from bureau data endpoint',
          );
        }

        oboe(Readable.fromWeb(response.body))
          .node('data.*', (item) => {
            subscriber.next(item as Model);
          })
          .done(() => {
            subscriber.complete();
          })
          .fail((error) => {
            subscriber.error(error);
          });
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
```

---

### Task 4: Split `sources/voting.ts`

**Files:**

- Create: `apps/ingestion/src/finders/voting.ts`
- Create: `apps/ingestion/src/retrievers/voting.ts`

**Step 1: Create `apps/ingestion/src/finders/voting.ts`**

```ts
import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();
  const needles = [];

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
      if (href) {
        const match = /Leg(\d+)\/Sesion(\d+)/.exec(href);
        needles.push({
          url: href,
          extra: {
            legislature: match?.[1] ? parseInt(match[1], 10) : null,
            session: match?.[2] ? parseInt(match[2], 10) : null,
          },
        });
      }
    }

    return needles;
  } finally {
    await page.close();
  }
};

export { finder };
```

**Step 2: Create `apps/ingestion/src/retrievers/voting.ts`**

```ts
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  LEGISLATURE: z.number(),
  SESSION_NUMBER: z.number(),
  VOTING_NUMBER: z.number(),
  VOTING_DATE: z.string(),
  VOTING_TITLE: z.string(),
  VOTING_DESCRIPTION: z.string(),
  BY_ASSENT: z.boolean(),
  TOTAL_PRESENT: z.number(),
  TOTAL_FOR: z.number(),
  TOTAL_AGAINST: z.number(),
  TOTAL_ABSTENTION: z.number(),
  TOTAL_NO_VOTE: z.number(),
  DEPUTY_SEAT: z.string(),
  DEPUTY_NAME: z.string(),
  DEPUTY_GROUP: z.string(),
  VOTE: z.string(),
  JSON_URL: z.string(),
});

const retriever: Retriever<Model> = ({ fetch, url, extra }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(
            `HTTP ${String(response.status)}: ${response.statusText}`,
          );
        }

        const votingData = (await response.json()) as {
          informacion: {
            legislatura: number;
            sesion: number;
            numeroVotacion: number;
            fecha: string;
            titulo: string;
            textoExpediente: string;
          } & Record<string, unknown>;
          totales: {
            asentimiento: string;
            presentes: number;
            afavor: number;
            enContra: number;
            abstenciones: number;
            noVotan: number;
          } & Record<string, unknown>;
          votaciones: ({
            asiento: string;
            diputado: string;
            grupo: string;
            voto: string;
          } & Record<string, unknown>)[];
        };

        for (const vote of votingData.votaciones) {
          const record = {
            LEGISLATURE:
              (extra as { legislature?: number | null } | undefined)
                ?.legislature ?? votingData.informacion.legislatura,
            SESSION_NUMBER: votingData.informacion.sesion,
            VOTING_NUMBER: votingData.informacion.numeroVotacion,
            VOTING_DATE: votingData.informacion.fecha,
            VOTING_TITLE: votingData.informacion.titulo,
            VOTING_DESCRIPTION: votingData.informacion.textoExpediente,
            BY_ASSENT: votingData.totales.asentimiento === 'Sí',
            TOTAL_PRESENT: votingData.totales.presentes,
            TOTAL_FOR: votingData.totales.afavor,
            TOTAL_AGAINST: votingData.totales.enContra,
            TOTAL_ABSTENTION: votingData.totales.abstenciones,
            TOTAL_NO_VOTE: votingData.totales.noVotan,
            DEPUTY_SEAT: (vote as Record<string, unknown>).asiento as string,
            DEPUTY_NAME: (vote as Record<string, unknown>).diputado as string,
            DEPUTY_GROUP: (vote as Record<string, unknown>).grupo as string,
            VOTE: (vote as Record<string, unknown>).voto as string,
            JSON_URL: url,
          };

          subscriber.next(Schema.parse(record));
        }

        subscriber.complete();
      } catch (error) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(error as Error).message}`, {
            cause: error,
          }),
        );
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
```

---

### Task 5: Split `sources/intervention.ts`

**Files:**

- Create: `apps/ingestion/src/finders/intervention.ts`
- Create: `apps/ingestion/src/retrievers/intervention.ts`

**Step 1: Create `apps/ingestion/src/finders/intervention.ts`**

```ts
import { getLastSuccessfulRun } from '@congress/database';

import type { Finder, Needle } from '../types.ts';

const MAX_PAGES = 200;
const LEGISLATURE_XV_START = new Date('2024-01-01');

const finder: Finder = async ({ browser }) => {
  const lastRun = await getLastSuccessfulRun('intervention');

  const today = new Date();
  const dateFrom = lastRun ?? LEGISLATURE_XV_START;

  const formatDate = (d: Date): string => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };

  const page = await browser.newPage();
  const needles: Needle[] = [];

  try {
    const searchUrl = new URL(
      'https://www.congreso.es/es/busqueda-de-intervenciones',
    );
    searchUrl.searchParams.set('p_p_id', 'intervenciones');
    searchUrl.searchParams.set('p_p_lifecycle', '0');
    searchUrl.searchParams.set('_intervenciones_mode', 'busqueda');
    searchUrl.searchParams.set('_intervenciones_legislatura', 'XV');
    searchUrl.searchParams.set(
      '_intervenciones_fecha_inicio',
      formatDate(dateFrom),
    );
    searchUrl.searchParams.set('_intervenciones_fecha_fin', formatDate(today));

    await page.goto(searchUrl.href, { waitUntil: 'networkidle' });

    let hasNextPage = true;
    let pageCount = 0;

    while (hasNextPage && pageCount < MAX_PAGES) {
      pageCount++;

      const links = await page
        .locator('a[href*="_intervenciones_id_texto"]')
        .all();

      for (const link of links) {
        const href = await link.getAttribute('href');
        if (href) {
          const fullUrl = new URL(href, 'https://www.congreso.es').href;
          needles.push({ url: fullUrl });
        }
      }

      const nextLinkEl = page
        .locator(
          'a.next, a[title*="Siguiente"], a[aria-label*="Siguiente"], a[title*="siguiente"]',
        )
        .first();

      const nextHref = await nextLinkEl.getAttribute('href').catch(() => null);

      if (nextHref && nextHref.trim() !== '') {
        await page.goto(new URL(nextHref, 'https://www.congreso.es').href, {
          waitUntil: 'networkidle',
        });
      } else {
        hasNextPage = false;
      }
    }

    if (pageCount >= MAX_PAGES) {
      console.warn(
        '[intervention] Reached pagination limit; some sessions may be missed',
      );
    }
  } finally {
    await page.close();
  }

  return needles;
};

export { finder };
```

**Step 2: Create `apps/ingestion/src/retrievers/intervention.ts`**

```ts
import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  ORDER: z.number(),
  SESSION_DATE: z.string(),
  SESSION_ID: z.string(),
  SESSION_TITLE: z.string(),
  SESSION_URL: z.string(),
  SPEAKER: z.string(),
  SPEAKER_NAME: z.string(),
  SPEAKER_ROLE: z.string().optional(),
  TEXT: z.string(),
});

const retriever: Retriever<Model> = ({ browser, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(url);

        const sessionIdRaw =
          (await page.locator('.datos2').textContent()) ?? '';
        const sessionTitleRaw =
          (await page.locator('.cabecera2').textContent()) ?? '';
        const sessionDateRaw =
          (await page.locator('.datos1').textContent()) ?? '';

        const sessionId = /cve:\s*(.+)/.exec(sessionIdRaw)?.[1] ?? '';
        const sessionDate =
          /\d{2}\/\d{2}\/\d{4}/.exec(sessionDateRaw)?.[0] ?? '';
        const sessionTitle = sessionTitleRaw.trim();

        const textContent = (await page.textContent('.textoIntegro')) ?? '';

        if (!textContent) {
          subscriber.complete();
          return;
        }

        const speakerPattern =
          /((?:El|La) señor[a]? [A-ZÁÉÍÓÚÑ\s]+(?:\([^)]+\))?:)/g;
        const parts = textContent.split(speakerPattern);

        let order = 0;
        for (let i = 1; i < parts.length; i += 2) {
          const speakerRaw = parts[i]?.replace(':', '').trim() ?? '';
          const roleMatch = /\(([^)]+)\)/.exec(speakerRaw);
          const speakerName = speakerRaw
            .replace(/\([^)]+\)/, '')
            .replace(/^(El|La) señor[a]? /, '')
            .trim();

          const interventionText = parts[i + 1]?.trim() ?? '';

          if (interventionText) {
            subscriber.next({
              ORDER: order,
              SESSION_DATE: sessionDate,
              SESSION_ID: sessionId,
              SESSION_TITLE: sessionTitle,
              SESSION_URL: url,
              SPEAKER: speakerRaw,
              SPEAKER_NAME: speakerName,
              SPEAKER_ROLE: roleMatch?.[1],
              TEXT: interventionText,
            });
            order++;
          }
        }

        subscriber.complete();
      } catch (cause) {
        const error = new Error(
          `Unable to parse intervention from ${url}: ${(cause as Error).message}`,
          { cause },
        );
        subscriber.error(error);
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
```

---

### Task 6: Split `sources/person-detail.ts`

**Files:**

- Create: `apps/ingestion/src/finders/personDetail.ts`
- Create: `apps/ingestion/src/retrievers/personDetail.ts`

**Step 1: Create `apps/ingestion/src/finders/personDetail.ts`**

```ts
import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface APIDeputyItem {
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

const finder: Finder = async ({ fetch }) => {
  const params = new URLSearchParams();
  params.append('_diputadomodule_idLegislatura', '15');
  params.append('_diputadomodule_filtroProvincias', '[]');

  const response = await fetch(
    'https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: params.toString(),
      method: 'POST',
    },
  );

  const { data } = (await response.json()) as { data: APIDeputyItem[] };

  return data.map((item) => ({
    url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}&mostrarAgenda=false`,
    extra: item,
  }));
};

export type { APIDeputyItem };
export { finder };
```

**Step 2: Create `apps/ingestion/src/retrievers/personDetail.ts`**

```ts
import { Observable } from 'rxjs';
import { z } from 'zod';

import { random } from '../utils.ts';

import type { APIDeputyItem } from '../finders/personDetail.ts';
import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  CIRCUNSCRIPCION: z.number(),
  COD_PARLAMENTARIO: z.number(),
  DECLARACION_ACTIVIDADES_URL: z.string().optional(),
  DECLARACION_BIENES_URL: z.string().optional(),
  DECLARACION_INTERESES_URL: z.string().optional(),
  EMAIL: z.string().optional(),
  FACEBOOK: z.string().optional(),
  FECHA_NACIMIENTO: z.string().optional(),
  FORMACION: z.string(),
  FOTO_URL: z.string(),
  GENERO: z.number(),
  GRUPO: z.string(),
  INSTAGRAM: z.string().optional(),
  LEGISLATURAS: z.array(z.number()),
  LINKEDIN: z.string().optional(),
  NOMBRE: z.string(),
  TWITTER: z.string().optional(),
  WEB: z.string().optional(),
});

const retriever: Retriever<Model> = ({ browser, extra, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const deputy = extra as APIDeputyItem;
      const page = await browser.newPage();

      try {
        await page.goto(url);

        const [
          DECLARACION_ACTIVIDADES_URL,
          DECLARACION_BIENES_URL,
          DECLARACION_INTERESES_URL,
          EMAIL,
          FACEBOOK,
          FECHA_NACIMIENTO,
          FOTO_URL,
          INSTAGRAM,
          LEGISLATURAS,
          LINKEDIN,
          TWITTER,
          WEB,
        ] = await Promise.all([
          page
            .getByText('Declaración de Actividades')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Actividades URL: ${(error as Error).message}`,
              );
            }),
          page
            .getByText('Declaración de Bienes y Rentas')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Bienes y Rentas URL: ${(error as Error).message}`,
              );
            }),
          page
            .getByText('Declaración de Intereses Económicos')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Intereses Económicos URL: ${(error as Error).message}`,
              );
            }),
          page
            .locator('a[href^="mailto:"]')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => (link ?? '').replace('mailto:', '')),
          page
            .locator('a:has(img[alt="facebook"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('text=/Nacid[oa] el/')
            .first()
            .textContent({ timeout: random(1000, 3000) })
            .then((textContent) => {
              const [date = undefined] =
                /\d{2}\/\d{2}\/\d{4}/.exec(textContent ?? '') ?? [];
              return date;
            })
            .catch(() => undefined),
          page
            .locator('img[alt="Card image cap"]')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch(() => {
              throw new Error('Failed to extract Foto URL');
            }),
          page
            .locator('a:has(img[alt="instagram"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('#_diputadomodule_legislaturasDiputado option')
            .all()
            .then((options) =>
              Promise.all(
                options.map((option) =>
                  option
                    .getAttribute('value', { timeout: random(1000, 3000) })
                    .then(Number),
                ),
              ),
            )
            .catch(() => [] as number[]),
          page
            .locator('a:has(img[alt="linkedin"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="twitter"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="personal-web"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
        ]);

        subscriber.next({
          CIRCUNSCRIPCION: deputy.idCircunscripcion,
          COD_PARLAMENTARIO: deputy.codParlamentario,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_ACTIVIDADES_URL: DECLARACION_ACTIVIDADES_URL!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_BIENES_URL: DECLARACION_BIENES_URL!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_INTERESES_URL: DECLARACION_INTERESES_URL!,
          EMAIL,
          FACEBOOK,
          FECHA_NACIMIENTO,
          FORMACION: deputy.formacion,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          FOTO_URL: FOTO_URL!,
          GENERO: deputy.genero,
          GRUPO: deputy.grupo,
          INSTAGRAM,
          LEGISLATURAS,
          LINKEDIN,
          NOMBRE: deputy.apellidosNombre,
          TWITTER,
          WEB,
        });

        subscriber.complete();
      } catch (cause) {
        const error = new Error(
          `Unable to parse ${url}: ${(cause as Error).message}`,
          { cause },
        );
        subscriber.error(error);
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
```

---

### Task 7: Update `main.ts` imports for refactored sources

**Files:**

- Modify: `apps/ingestion/src/main.ts`

Update the import block at the top of `main.ts`. Replace:

```ts
import * as bureau from './sources/bureau.ts';
import * as intervention from './sources/intervention.ts';
import * as person from './sources/person.ts';
import * as voting from './sources/voting.ts';

import type { Finder, Needle, Retriever } from './sources/types.ts';
```

With:

```ts
import { finder as bureauFinder } from './finders/bureau.ts';
import { finder as interventionFinder } from './finders/intervention.ts';
import { finder as personFinder } from './finders/person.ts';
import { finder as votingFinder } from './finders/voting.ts';
import { retriever as bureauRetriever } from './retrievers/bureau.ts';
import { retriever as interventionRetriever } from './retrievers/intervention.ts';
import { retriever as personRetriever } from './retrievers/person.ts';
import { retriever as votingRetriever } from './retrievers/voting.ts';

import type { Finder, Needle, Retriever } from './types.ts';
```

Then update each pipeline body to use the new names. Replace `person.finder` →
`personFinder`, `person.retriever` → `personRetriever`, etc. (four pipelines ×
two references each = 8 substitutions).

**Step 1: Verify type-check passes**

```bash
pnpm --filter @congress/ingestion lint:types
```

Expected: no errors.

---

### Task 8: Delete `sources/` directory and commit

**Step 1: Delete sources directory**

```bash
rm -rf apps/ingestion/src/sources
```

**Step 2: Verify lint and type-check pass**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors, no warnings.

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor(ingestion): split sources/ into finders/, retrievers/, processors/"
```

---

## Commit 2 — Initiatives pipeline

### Task 9: Create initiatives finder

**Files:**

- Create: `apps/ingestion/src/finders/initiatives.ts`

The congreso.es open data page at
`https://www.congreso.es/es/opendata/iniciativas` contains download links for
four JSON files with timestamped filenames. The finder navigates the page with
Playwright and returns one `Needle` per JSON link.

```ts
import type { Finder } from '../types.ts';

const INITIATIVES_CATEGORIES = [
  'IniciativasLegislativasAprobadas',
  'ProyectosDeLey',
  'PropuestasDeReforma',
  'ProposicionesDeLey',
] as const;

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/iniciativas', {
      waitUntil: 'networkidle',
    });

    const needles = [];

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
      needles.push({ url: url.href, extra: { category } });
    }

    return needles;
  } finally {
    await page.close();
  }
};

export { finder };
```

---

### Task 10: Create initiatives retriever

**Files:**

- Create: `apps/ingestion/src/retrievers/initiatives.ts`

The JSON files contain flat arrays of initiative objects. The retriever streams
each item via oboe, injects `LEGISLATURE: 15`, and emits typed records.
`InitiativeInputSchema` is used for validation (from `@congress/database`).

```ts
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';

import type { InitiativeInput } from '@congress/database';
import type { Retriever } from '../types.ts';

const CURRENT_LEGISLATURE = 15;

const retriever: Retriever<InitiativeInput> = ({ fetch, url }) => {
  return new Observable((subscriber) => {
    void (async () => {
      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch initiatives data: ${String(response.status)} ${response.statusText}`,
          );
        }

        if (response.body === null) {
          throw new Error(
            'Response body is null: no data stream available from initiatives endpoint',
          );
        }

        oboe(Readable.fromWeb(response.body))
          .node('!.*', (item: unknown) => {
            subscriber.next({
              ...(item as Record<string, unknown>),
              LEGISLATURE: CURRENT_LEGISLATURE,
            } as InitiativeInput);
          })
          .done(() => {
            subscriber.complete();
          })
          .fail((error) => {
            subscriber.error(error);
          });
      } catch (e) {
        subscriber.error(e);
      }
    })();
  });
};

export { retriever };
```

---

### Task 11: Add `persistInitiatives` sink

**Files:**

- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`

**Step 1: Add import and function to `sinks/database.ts`**

Add `upsertInitiatives` to the existing import from `@congress/database`:

```ts
import {
  upsertDeputies,
  upsertInitiatives,
  upsertOrganMembers,
  upsertSpeeches,
  upsertVotingRecords,
} from '@congress/database';
```

Then add the `persistInitiatives` function at the end of the file (before any
exports), following the exact same pattern as `persistOrganMembers`:

```ts
/**
 * RxJS operator that buffers initiative records and persists to database
 */
export function persistInitiatives(): OperatorFunction<unknown, PersistResult> {
  let batches = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      bufferCount(BATCH_SIZE),
      mergeMap(async (batch) => {
        const result = await upsertInitiatives(batch);
        batches++;
        totalSuccess += result.success;
        totalSkipped += result.skipped;
        console.log(
          `[initiatives] Batch ${String(batches)}: ${String(result.success)} success, ${String(result.skipped)} skipped`,
        );
        return result;
      }),
      finalize(() => {
        console.log(
          `[initiatives] Complete: ${String(batches)} batches, ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'initiatives',
                batches,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}
```

**Step 2: Export from `sinks/index.ts`**

Add `persistInitiatives` to the export list:

```ts
export {
  persistDeputies,
  persistInitiatives,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
  type PersistResult,
} from './database.ts';
```

---

### Task 12: Wire `runInitiativesPipeline` in `main.ts` and commit

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Add imports**

Add to the finders/retrievers import block:

```ts
import { finder as initiativesFinder } from './finders/initiatives.ts';
import { retriever as initiativesRetriever } from './retrievers/initiatives.ts';
```

Add `persistInitiatives` to the sinks import:

```ts
import {
  persistDeputies,
  persistInitiatives,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
} from './sinks/index.ts';
```

**Step 2: Add pipeline function**

Add before the CLI entry point section:

```ts
// ---------------------------------------------------------------------------
// Initiatives pipeline
// ---------------------------------------------------------------------------

async function runInitiativesPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(initiativesFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[initiatives] No needles found, skipping');
      await updateScraperMetadata('initiatives', true);
      return;
    }

    const stream = retrieveAll(initiativesRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(stream.pipe(persistInitiatives()));

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
```

**Step 3: Register in `pipelines` map and exports**

Add `initiatives: runInitiativesPipeline` to the `pipelines` record.

Add `runInitiativesPipeline` to the `export { ... }` at the bottom.

**Step 4: Lint check**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors, no warnings.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingestion): add initiatives pipeline"
```

---

## Commit 3 — Interest declarations pipeline

### Task 13: Create interest declarations retriever

**Files:**

- Create: `apps/ingestion/src/retrievers/interestDeclarations.ts`

The retriever reuses the personDetail finder. It receives one needle per deputy
(with `extra` containing the `APIDeputyItem`). It maps the person-detail record
emitted by the personDetail retriever into an `InterestDeclarationInput` with
only `DEPUTY_ID`, `YEAR`, and `PDF_URL` populated.

Note: `DEPUTY_ID` in the DB schema is the deputy's `codParlamentario` as a
string, since `InterestDeclaration.deputyId` is a FK to `Deputy.id`, which is
set to `codParlamentario.toString()` in the deputies repository.

```ts
import { Observable } from 'rxjs';

import type { InterestDeclarationInput } from '@congress/database';
import type { Model as PersonDetailModel } from './personDetail.ts';
import type { Retriever } from '../types.ts';

// Re-export the personDetail retriever — the pipeline wires personDetail finder
// with this retriever, which wraps the personDetail retriever and maps output.
export { retriever as personDetailRetriever } from './personDetail.ts';

const retriever: Retriever<InterestDeclarationInput> = (options) => {
  // Import inline to avoid circular — personDetail retriever is the upstream
  const { retriever: personDetailRetriever } = await import(
    './personDetail.ts'
  );

  return new Observable((subscriber) => {
    personDetailRetriever(options).subscribe({
      next: (record: PersonDetailModel) => {
        const year = new Date().getFullYear();

        subscriber.next({
          DEPUTY_ID: String(record.COD_PARLAMENTARIO),
          PDF_URL: record.DECLARACION_BIENES_URL,
          YEAR: year,
        });
      },
      error: (err: unknown) => subscriber.error(err),
      complete: () => subscriber.complete(),
    });
  });
};

export { retriever };
```

**Important:** the `await import()` inside a non-async arrow function is not
valid. Use a static import instead. Rewrite as:

```ts
import { Observable } from 'rxjs';

import { retriever as personDetailRetriever } from './personDetail.ts';

import type { InterestDeclarationInput } from '@congress/database';
import type { Model as PersonDetailModel } from './personDetail.ts';
import type { Retriever } from '../types.ts';

const retriever: Retriever<InterestDeclarationInput> = (options) => {
  return new Observable((subscriber) => {
    personDetailRetriever(options).subscribe({
      next: (record: PersonDetailModel) => {
        subscriber.next({
          DEPUTY_ID: String(record.COD_PARLAMENTARIO),
          PDF_URL: record.DECLARACION_BIENES_URL,
          YEAR: new Date().getFullYear(),
        });
      },
      error: (err: unknown) => subscriber.error(err),
      complete: () => subscriber.complete(),
    });
  });
};

export { retriever };
```

---

### Task 14: Create interest declarations processor (stub)

**Files:**

- Create: `apps/ingestion/src/processors/interestDeclarations.ts`

The processor is an identity pass-through. It exists as an extension point for
future PDF parsing. When PDF parsing is implemented, this file is the only place
that needs to change.

```ts
import { identity } from 'rxjs';

import type { InterestDeclarationInput } from '@congress/database';
import type { Processor } from '../types.ts';

/**
 * Identity processor for interest declarations.
 *
 * Currently passes records through unchanged. In the future, this processor
 * will download the PDF at PDF_URL and extract structured financial data
 * (real estate, bank accounts, securities, income sources) to populate the
 * full InterestDeclarationInput schema.
 */
const processor: Processor<InterestDeclarationInput> = identity;

export { processor };
```

---

### Task 15: Add `persistInterestDeclarations` sink

**Files:**

- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`

**Step 1: Add import to `sinks/database.ts`**

Add `upsertInterestDeclaration` to the import:

```ts
import {
  upsertDeputies,
  upsertInitiatives,
  upsertInterestDeclaration,
  upsertOrganMembers,
  upsertSpeeches,
  upsertVotingRecords,
} from '@congress/database';
```

**Step 2: Add `persistInterestDeclarations` function**

Unlike the other sinks, `upsertInterestDeclaration` takes a single record (not a
batch), so no `bufferCount` is used:

```ts
/**
 * RxJS operator that persists interest declaration records to database.
 * Each record is upserted individually (no batching) because the repository
 * runs a transaction per declaration.
 */
export function persistInterestDeclarations(): OperatorFunction<
  unknown,
  PersistResult
> {
  let totalSuccess = 0;
  let totalSkipped = 0;

  return (source: Observable<unknown>) =>
    source.pipe(
      mergeMap(async (record) => {
        const success = await upsertInterestDeclaration(record);
        if (success) {
          totalSuccess++;
        } else {
          totalSkipped++;
        }
        return success;
      }),
      finalize(() => {
        console.log(
          `[interestDeclarations] Complete: ${String(totalSuccess)} success, ${String(totalSkipped)} skipped`,
        );
      }),
      (obs) =>
        new Observable<PersistResult>((subscriber) => {
          obs.subscribe({
            complete: () => {
              subscriber.next({
                source: 'interestDeclarations',
                batches: totalSuccess + totalSkipped,
                totalSuccess,
                totalSkipped,
              });
              subscriber.complete();
            },
            error: (err: Error) => {
              subscriber.error(err);
            },
          });
        }),
    );
}
```

**Step 3: Export from `sinks/index.ts`**

```ts
export {
  persistDeputies,
  persistInitiatives,
  persistInterestDeclarations,
  persistOrganMembers,
  persistSpeeches,
  persistVotes,
  type PersistResult,
} from './database.ts';
```

---

### Task 16: Wire `runInterestDeclarationsPipeline` in `main.ts` and commit

**Files:**

- Modify: `apps/ingestion/src/main.ts`

**Step 1: Add imports**

```ts
import { finder as personDetailFinder } from './finders/personDetail.ts';
import { retriever as interestDeclarationsRetriever } from './retrievers/interestDeclarations.ts';
import { processor as interestDeclarationsProcessor } from './processors/interestDeclarations.ts';
```

Add `persistInterestDeclarations` to the sinks import.

**Step 2: Add pipeline function**

```ts
// ---------------------------------------------------------------------------
// Interest declarations pipeline
// ---------------------------------------------------------------------------

async function runInterestDeclarationsPipeline(): Promise<void> {
  const browser = await launch({ headless: true });

  try {
    const needles = await findAll(personDetailFinder, { browser, fetch });

    if (needles.length === 0) {
      console.log('[interestDeclarations] No deputies found, skipping');
      await updateScraperMetadata('interestDeclarations', true);
      return;
    }

    console.log(
      `[interestDeclarations] Processing ${String(needles.length)} deputies`,
    );

    const stream = retrieveAll(interestDeclarationsRetriever, needles, {
      browser,
      fetch,
    });

    await lastValueFrom(
      stream.pipe(interestDeclarationsProcessor, persistInterestDeclarations()),
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
```

**Step 3: Register in `pipelines` map and exports**

Add `interestDeclarations: runInterestDeclarationsPipeline` to the `pipelines`
record and add `runInterestDeclarationsPipeline` to the `export { ... }`.

**Step 4: Final lint check**

```bash
pnpm --filter @congress/ingestion lint:ci
```

Expected: no errors, no warnings.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(ingestion): add interest declarations pipeline"
```

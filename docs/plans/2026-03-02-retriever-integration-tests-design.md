# Retriever Integration Tests — Design

**Date**: 2026-03-02

## Goal

Verify that all 6 active retrievers in `apps/ingestion` work correctly against
the live congress.es website by running them end-to-end with a real Playwright
browser and real HTTP requests.

## Approach

Manual runner script (no test framework), consistent with
`src/test/finders.test.ts`. No new dependencies.

## File

`apps/ingestion/src/test/retrievers.test.ts`

Run with:

```bash
node --import tsx/esm src/test/retrievers.test.ts
```

New npm script in `apps/ingestion/package.json`:

```json
"test:retrievers": "node --import tsx/esm src/test/retrievers.test.ts"
```

## Structure

One top-level `async function main()`. Steps:

1. Launch one shared `chromium` browser.
2. For the three retrievers that need fresh URLs, run their finders first.
3. Construct hardcoded needles for the remaining three.
4. Invoke each retriever with its needle, collect up to 5 records via
   `take(5)` + `lastValueFrom` (RxJS — already a dependency).
5. Assert on output shape.
6. Log `PASS` / `FAIL` per retriever with timing.
7. Print summary. Set `process.exitCode = 1` if any assertion failed.
8. Close browser in `finally`.

## Needle Sourcing

| Retriever               | Source                   | Detail                                                                                                       |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `person`                | Run `person` finder      | JSON URL contains timestamp — must be discovered                                                             |
| `voting`                | Hardcoded                | `Leg15/Sesion1.json`, stable per-session URL                                                                 |
| `bureau`                | Run `bureau` finder      | POST URL captured dynamically from browser network                                                           |
| `intervention`          | Hardcoded                | `(DSCD-15-CO-492.CODI.)` transcript, permanent URL                                                           |
| `initiatives`           | Run `initiatives` finder | JSON URL contains timestamp — take first needle                                                              |
| `interest-declarations` | Hardcoded                | `codParlamentario=160, idLegislatura=XV` (deputy Abades Martínez, Cristina) with sample `declarations` array |

## Retriever Invocation

Retrievers return `Observable<T>`. Collect at most 5 records:

```ts
import { lastValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';

const records = await lastValueFrom(
  retriever({ browser, fetch: globalThis.fetch, url, extra }).pipe(
    take(5),
    toArray(),
  ),
);
```

## Assertions Per Retriever

| Retriever               | Checks                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `person`                | `length >= 1`; each record has `NOMBRE`, `FORMACIONELECTORAL`, `GRUPOPARLAMENTARIO` as non-empty strings            |
| `voting`                | `length >= 1`; each record has `LEGISLATURE` (number), `VOTING_DATE` (string), `VOTE` (string), `JSON_URL` (string) |
| `bureau`                | `length >= 1`; each record has `Nombre`, `NombreOrgano`, `Cargo`, `FechaAlta` as non-empty strings                  |
| `intervention`          | `length >= 1`; each record has `SESSION_ID`, `SPEAKER`, `TEXT` as non-empty strings                                 |
| `initiatives`           | `length >= 1`; each record has `LEGISLATURE` (number), `TIPO` (string), `TITULO_LEY` (string)                       |
| `interest-declarations` | `length === 1`; record has `DEPUTY_ID` (string), `YEAR` (number)                                                    |

## Hardcoded Needle Values

### `voting`

```ts
{
  url: 'https://www.congreso.es/webpublica/opendata/votaciones/Leg15/Sesion1.json',
  extra: { legislature: 15, session: 1 },
}
```

### `intervention`

```ts
{
  url: 'https://www.congreso.es/busqueda-de-intervenciones?p_p_id=intervenciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_intervenciones_mode=mostrarTextoIntegro&_intervenciones_legislatura=XV&_intervenciones_id_texto=(DSCD-15-CO-492.CODI.)#(P%C3%A1gina2)',
  extra: undefined,
}
```

### `interest-declarations`

```ts
{
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
}
```

## What Is Not Tested

- Full record counts (only first 5 records validated).
- Sink operators (DB writes) — out of scope.
- Retry logic.
- `person-detail` retriever — not wired into any active pipeline.

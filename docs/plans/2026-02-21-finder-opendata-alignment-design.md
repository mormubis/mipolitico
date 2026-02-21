# Finder Opendata Alignment — Design

**Date:** 2026-02-21 **Status:** Approved

## Problem

Two finders bypass the opendata pages entirely, hardcoding deep internal URLs
that are more likely to change:

- `finders/intervention.ts` — navigates directly to `busqueda-de-intervenciones`
  (search UI), paginates up to 200 pages with a hardcoded legislature code
- `finders/personDetail.ts` — POSTs directly to an internal API endpoint
  (`busqueda-de-diputados?...resourceId=searchDiputados`)

The opendata subpages (`opendata/diputados`, `opendata/intervenciones`, etc.)
are the stable contract. All finders should start there.

## Motivation

**Resilience.** If the site restructures internal URLs or changes API
parameters, the opendata entry points are the least likely to break. Anchoring
all finders to these pages reduces the blast radius of site changes.

## Scope

### Files changed

| File                                 | Change                                   |
| ------------------------------------ | ---------------------------------------- |
| `finders/intervention.ts`            | Rewrite                                  |
| `finders/personDetail.ts`            | Rewrite                                  |
| `finders/interestDeclarations.ts`    | New file                                 |
| `retrievers/interestDeclarations.ts` | Update                                   |
| `main.ts`                            | Update `runInterestDeclarationsPipeline` |

### Files unchanged

All other finders, retrievers, sinks, processors, database layer, and API are
untouched.

---

## Section 1 — Intervention finder

### Current behaviour

Navigates `busqueda-de-intervenciones` with date-range query params and a
hardcoded legislature code (`XV`). Paginates through up to 200 result pages,
collecting individual detail page URLs as needles.

### New behaviour

1. Navigate `congreso.es/es/opendata/intervenciones`
2. Find the `IntervencionesCronologicamente` JSON link
   (`a[href*="IntervencionesCronologicamente"][href$="json"]`)
3. Fetch the JSON (using `fetch`, no browser needed)
4. Apply the date watermark: filter rows where `SESION` (DD/MM/YYYY) >
   `lastSuccessfulRun` (falls back to Legislature XV start: 2024-01-01)
5. Deduplicate by `ENLACETEXTOINTEGRO` — multiple speech rows share one detail
   page
6. Emit one `Needle` per unique detail page URL, carrying the bulk row's
   metadata in `extra`

### What does NOT change

The `intervention.ts` retriever is unchanged. It still visits each detail page
and scrapes `SESSION_ID`, `SESSION_TITLE`, `SESSION_DATE`, and full `TEXT`.

### Benefits

- Eliminates the 200-page pagination loop
- Removes the hardcoded legislature code (`XV`) and its `TODO`
- The bulk JSON already covers all sessions; date filtering replaces UI-based
  date params

---

## Section 2 — personDetail finder

### Current behaviour

POSTs to a hardcoded internal API endpoint
(`busqueda-de-diputados?p_p_resource_id=searchDiputados`) to retrieve the deputy
list for Legislature 15, then constructs profile page URLs manually using
`codParlamentario` and a romanized legislature number.

### New behaviour

1. Navigate `congreso.es/es/opendata/diputados`
2. Find the `DiputadosActivos` JSON link
   (`a[href*="DiputadosActivos"][href$="json"]`) — the same link `person.ts`
   already uses
3. Fetch the JSON (using `fetch`)
4. Map each entry to a profile page URL needle, carrying the deputy item in
   `extra`

The profile URL construction is the same as today. This eliminates the hardcoded
internal API POST endpoint.

The `personDetail.ts` retriever is unchanged.

---

## Section 3 — interestDeclarations finder (new file)

### Current behaviour

`runInterestDeclarationsPipeline` reuses `personDetailFinder` to get deputy
profile URLs, then the `interestDeclarations` retriever visits each profile page
to extract a PDF URL. Structured declaration data is not captured.

### New behaviour

A new `finders/interestDeclarations.ts`:

1. Navigate `congreso.es/es/opendata/diputados`
2. Find two links on the same page:
   - `DiputadosActivos` JSON (`a[href*="DiputadosActivos"][href$="json"]`)
   - `docacteco` JSON (`a[href*="docacteco"][href$="json"]`)
3. Fetch both JSONs in parallel
4. Build a lookup map from the `DiputadosActivos` data: normalized
   `apellidosNombre` → `{ codParlamentario, idLegislatura }`
5. Group `docacteco` rows by `NOMBRE`, match each group to a deputy via the
   lookup map
6. For each matched deputy, emit one `Needle`:
   - `url`: the deputy's profile page URL (same construction as today)
   - `extra`: `{ codParlamentario, declarations: BulkDeclarationRow[] }`

Deputies in `docacteco` with no name match in `DiputadosActivos` are logged as
warnings and skipped.

### interestDeclarations retriever (updated)

Receives a needle with `extra.codParlamentario` and `extra.declarations`.

1. Visit the profile page (same as today) — only to extract
   `DECLARACION_INTERESES_URL`
2. Combine the PDF URL with the structured rows from `extra.declarations`:
   - Map `TIPO === 'ACTIVIDAD'` rows to `PROFESSIONAL_ACTIVITIES` (`EMPLEADOR` →
     `entity`, `DESCRIPCION` → `position`, `PERIODO` → parsed date range,
     `SECTOR` → derive `remunerated: SECTOR !== 'PÚBLICO'` or keep as string)
3. Emit a single `InterestDeclarationInput` with:
   - `DEPUTY_ID`: `String(codParlamentario)`
   - `PDF_URL`: extracted from profile page
   - `PROFESSIONAL_ACTIVITIES`: mapped from bulk rows
   - `YEAR`: current year (unchanged)

Other `TIPO` values in the bulk file (if any appear) are logged and ignored
until the schema is extended.

### main.ts update

`runInterestDeclarationsPipeline` replaces `personDetailFinder` with the new
`interestDeclarationsFinder`. Everything else in the pipeline is unchanged.

---

## Bulk JSON field reference

### `IntervencionesCronologicamente` (interventions)

| Field                   | Description                              |
| ----------------------- | ---------------------------------------- |
| `LEGISLATURA`           | e.g. `"Leg.15"`                          |
| `OBJETOINICIATIVA`      | Subject/title of the initiative          |
| `SESION`                | Date `DD/MM/YYYY`                        |
| `ORGANO`                | Chamber/committee (e.g. `"Pleno"`)       |
| `FASE`                  | Phase of debate                          |
| `TIPOINTERVENCION`      | Type (e.g. `"Intervención"`)             |
| `ORADOR`                | Speaker full name                        |
| `CARGOORADOR`           | Speaker role                             |
| `INICIOINTERVENCION`    | Start time                               |
| `FININTERVENCION`       | End time                                 |
| `ENLACEDIFERIDO`        | Video link                               |
| `ENLACEDESCARGADIRECTA` | Direct video download                    |
| `ENLACETEXTOINTEGRO`    | **Detail page URL** (used as needle URL) |
| `ENLACEPDF`             | PDF transcript link                      |

### `docacteco` (interest declarations)

| Field           | Description                                     |
| --------------- | ----------------------------------------------- |
| `NOMBRE`        | `"Apellidos,Nombre"` format                     |
| `FECHAREGISTRO` | Registration date `DD/MM/YYYY`                  |
| `DECLARACION`   | Declaration type (e.g. `"Declaración inicial"`) |
| `TIPO`          | Category (e.g. `"ACTIVIDAD"`)                   |
| `PERIODO`       | Year or year range                              |
| `EMPLEADOR`     | Employer/entity                                 |
| `SECTOR`        | `"PÚBLICO"` or `"PRIVADO"`                      |
| `DESCRIPCION`   | Role description                                |

### `DiputadosActivos` (active deputies)

| Field               | Description             |
| ------------------- | ----------------------- |
| `codParlamentario`  | Numeric deputy ID       |
| `apellidosNombre`   | Full name (last, first) |
| `idLegislatura`     | Legislature number      |
| `formacion`         | Electoral formation     |
| `grupo`             | Parliamentary group     |
| `idCircunscripcion` | Constituency ID         |
| `genero`            | Gender code             |

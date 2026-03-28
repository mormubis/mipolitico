# Ingestion Architecture

This document captures the architectural decisions, data model design, and
operational knowledge accumulated during the development of the ingestion system
for MiPolítico.

---

## Overview

The ingestion system scrapes data from [congreso.es](https://www.congreso.es)
open data endpoints and persists it to the database. It follows a pipeline
model:

```
Finder → Retriever → Processor → Sink
```

- **Finder** — discovers URLs from the congress website
- **Retriever** — fetches and parses data from a URL, emits typed records
- **Processor** — transforms, joins, and enriches records from multiple
  retrievers
- **Sink** — persists records to the database (one entity type per sink)

---

## Run Modes

The ingestion supports two run modes:

### From-scratch run

- Database starts empty (or is cleared before running)
- Every entity is created fresh
- Deduplication happens within the run via in-memory maps
- Person side input starts empty and is built entirely from the current run's
  streams
- All pipelines run in dependency order

```bash
pnpm scrape --mode=scratch
```

### Delta run

- Database already has data from a previous run
- Only new or changed entities are processed
- Person side input is pre-populated from the database before any pipeline
  starts
- New persons discovered in the current run augment the side input as they
  arrive
- Faster — only processes changes since the last run

```bash
pnpm scrape --mode=delta
```

---

## Person Identity

`Person` is the universal identity container for any human who appears in
congressional records — deputies, ministers, external witnesses, former
officials, journalists, regional politicians, etc.

### Natural key

`Person.name` in `"Apellidos, Nombre"` format is the natural key. Analysis of
6,321 historical deputies across 45 years of Spanish parliamentary history shows
**zero name collisions** — no two different people share the same full name in
`"Apellidos, Nombre"` format.

### ID generation

Person IDs are random UUIDs (CUIDs) generated at the time the person is first
encountered in the pipeline. The same ID is reused for subsequent encounters via
a normalised name lookup map:

```
normalizeSpanishName("Olivera Serrano, Manuel") → "OLIVERA SERRANO MANUEL"
```

The lookup map is:

- **From-scratch run**: built entirely from the current run's streams (starts
  empty)
- **Delta run**: pre-populated from the database, augmented by current run's
  streams

### Deduplication

The `Person.name` column has a `@@unique` constraint. The `upsert` operation
ensures idempotency — running the pipeline twice creates one record.

When a name collision is detected (two genuinely different people with the same
name), the `biography` field serves as the first disambiguation signal:

- Deputies always have a biography from the bulk JSON
- External witnesses never have a biography
- If both have different non-null biographies, the collision is flagged for
  manual review

### Merging persons

When two `Person` records are discovered to represent the same real person, use
`mergePersons(keepId, mergeId)` from
`packages/database/src/repositories/persons.ts`. This function:

1. Reassigns all relations (`Deputy`, `Intervention`, `OrganMember`,
   `GovernmentMember`) from `mergeId` to `keepId`
2. Merges profile data (takes non-null values from either record)
3. Deletes the `mergeId` record
4. Blocks auto-merge if both records have different non-null biographies
   (requires `--force`)

---

## Person Roles

A person can hold multiple roles simultaneously or across time:

| Model              | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `Deputy`           | Elected to Congress for a specific legislature                         |
| `GovernmentMember` | Holds or held a national government role (minister, VP, president)     |
| `OrganMember`      | Member of a congressional organ (Mesa, Junta de Portavoces, committee) |

External witnesses (journalists, regional officials, former politicians
testifying) have a `Person` record but no role entity. Their context is captured
by `Intervention.speakerRole` (from `CARGOORADOR` in the bulk JSON).

---

## Speaker Attribution in Interventions

The `Intervention` model stores parliamentary speeches. Attributing each speech
to the correct person requires understanding three data sources:

### 1. Bulk JSON (intervention retriever)

File: `IntervencionesCronologicamente__*.json`

Contains one row per substantive intervention by a deputy or minister. Key
fields:

- `ORADOR` — full name in `"Apellidos, Nombre (GroupCode)"` format — the
  canonical speaker identity
- `CARGOORADOR` — role title at time of speaking (e.g. `"Ministra de Hacienda"`,
  `"periodista de El Món"`)
- `ENLACETEXTOINTEGRO` — URL with `#(PáginaX)` anchor pointing to the page in
  the HTML transcript where the speech starts

**The bulk JSON only records substantive interventions** — procedural chair
utterances (`PRESIDENTA`, `PRESIDENTE`, `VICEPRESIDENTE`) are absent.

### 2. HTML transcript (intervention-detail retriever)

Scraped from the session page. Contains ALL speakers including procedural ones.
Speaker names appear as ALL-CAPS surnames: `"El señor IÑARRITU GARCÍA:"`,
`"La señora PRESIDENTA:"`.

### 3. Anchor-based matching

The bulk JSON `ENLACETEXTOINTEGRO` anchor `#(PáginaX)` maps to
`<a name="(PáginaX)">` in the HTML. Multiple bulk rows can share the same page
anchor (multiple speakers on one page). The processor uses a two-tier matching
strategy:

**Tier 1 — Name match**: Normalised first word of HTML speaker name (`IÑARRITU`)
matches normalised first word of bulk ORADOR (`IÑARRITU GARCIA JON`).

**Tier 2 — Order fallback**: When name match fails (e.g. `PRESIDENTA` has no
surname), take the next unconsumed bulk row for this session in document order.

### Procedural interventions

Interventions marked `procedural = true` are chair management utterances with no
substantive content:

- Any speaker with text < 50 chars
- Chamber officers (`PRESIDENTA`, `PRESIDENTE`, `VICEPRESIDENTE`) with text <
  1000 chars

The `PRESIDENTA` of the chamber (Armengol Socias, Francina in XV legislature)
has ~14,000 procedural utterances (turn management, vote announcements) that are
NOT in the bulk JSON and cannot be reliably attributed. Her ~670 substantive
interventions ARE in the bulk JSON and are correctly attributed.

**Always filter `WHERE procedural = false`** for activity analysis.

### Attribution statistics (XV legislature)

| Category                            | Count   | % substantive |
| ----------------------------------- | ------- | ------------- |
| Deputy                              | ~33,800 | ~75%          |
| Government member                   | ~1,750  | ~4%           |
| Person (no role — external witness) | ~1,600  | ~4%           |
| Unlinked                            | ~7,700  | ~17%          |

The 17% unlinked are external witnesses (journalists, regional officials,
institutional heads) and procedural speakers not in the bulk JSON.

---

## Processor Architecture

### Current limitations (to be addressed in re-architecture)

1. **Processors query the database** — `intervention` processor calls
   `prisma.person.findMany()` to build a lookup map. This breaks on empty
   databases and creates an ordering dependency.

2. **Single output type** — each processor emits one entity type to one sink.
   The `intervention` processor should emit `PersonInput`,
   `GovernmentMemberInput`, and `InterventionInput` to three separate sinks.

3. **`after` gates as workaround** — the `intervention-detail` source has
   `after: ['intervention']` to ensure bulk metadata arrives before HTML
   records. This recreates sequential execution inside a concurrent streaming
   framework.

### Target architecture

**Processors have multiple typed inputs and outputs:**

```typescript
{
  name: 'intervention',
  inputs: ['intervention-bulk', 'intervention-detail', 'person'],  // side inputs
  processor: interventionProcessor,
  outputs: {
    person: persistPersons(),
    intervention: persistInterventions(),
    governmentMember: persistGovernmentMembers(),
  }
}
```

**Side inputs replace database lookups:**

The `person` retriever output flows into the `intervention` processor as a side
input — a pre-built `Map<normalizedName, personId>`. No database queries needed
in the processor. In delta runs, the side input is pre-populated from the
database.

**No database lookups in processors** — all enrichment data flows through the
stream graph. Processors are pure transformations of their inputs.

This mirrors Apache Beam's `ParDo` with additional outputs and side inputs
pattern.

---

## Name Normalisation

Spanish parliamentary names have several non-standard forms in transcripts that
require normalisation for matching:

| Pattern           | Example (Person.name)                   | Example (transcript)  |
| ----------------- | --------------------------------------- | --------------------- |
| Particle prefixed | `Olano Vela, Jaime Eduardo de`          | `DE OLANO VELA`       |
| Hyphen stripped   | `Ortega Smith-Molina, Francisco Javier` | `ORTEGA SMITH MOLINA` |
| Catalan connector | `Ogou i Corbi, Viviane`                 | `OGOU CORBI`          |
| Accent stripped   | `Iñarritu García, Jon`                  | `IÑARRITU GARCÍA`     |
| OCR errors        | `Álvaro Vidal, Francesc-Marc`           | `ÁLV ARO VIDAL`       |

The `normalizeSpanishName()` function in `apps/ingestion/src/utils.ts` handles
the systematic cases. The `corrections/name-overrides.ts` file handles
documented transcription errors that cannot be normalised algorithmically.

**Adding new corrections:** Run the pipeline, then query:

```sql
SELECT speakerName, COUNT(*) FROM Intervention
WHERE personId IS NULL AND speakerName GLOB '[A-ZÁ-Ú ]*'
GROUP BY speakerName ORDER BY COUNT(*) DESC;
```

Cross-reference against `Person.name` to identify likely matches.

---

## WAF and Rate Limiting

`congreso.es` uses Akamai WAF which blocks programmatic access. Key findings:

- **curl and headless Playwright (bundled Chromium)** are blocked — WAF detects
  the TLS fingerprint
- **Real Chrome binary**
  (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) bypasses the
  WAF
- **Node.js `fetch()`** is blocked for HTML pages, but allowed for `webpublica/`
  JSON endpoints
- **IP blocks** last at least 30 minutes and affect all subdomains
- **Browser pool** is restricted to Chromium only (Firefox and WebKit use
  bundled Playwright binaries)

When blocked, wait at least 30 minutes before retrying. Run individual sources
(`--source=person`) rather than full runs during development.

### Page content via `page.evaluate()`

When a Playwright page needs to fetch data that Node.js `fetch()` cannot (WAF
blocks), use `page.evaluate()` to run the fetch inside the browser context:

```typescript
const data = await page.evaluate(async (url: string) => {
  const r = await fetch(url);
  return r.json();
}, targetUrl);
```

---

## Ingestion Rate Limiting

The `src/network/pool.ts` limits to 5 concurrent browser requests with 1–5
second random delays. This may be insufficient for full runs.

**Fetch-based pipelines** (person, initiatives, interest-declarations,
intervention bulk) are less likely to trigger blocks than **Playwright-based
pipelines** (voting, bureau, person-detail, intervention-detail) which load full
HTML pages.

---

## Data Coverage (XV Legislature)

| Dataset                                 | Source                                   | Coverage                       |
| --------------------------------------- | ---------------------------------------- | ------------------------------ |
| Active deputies                         | `DiputadosActivos__*.json`               | 350/350                        |
| Inactive deputies (mid-legislature)     | `DiputadosDeBaja__*.json`                | 58/58                          |
| Deputy profiles (photo, email, socials) | Profile pages (Playwright)               | ~95% (WAF limits remainder)    |
| Voting sessions                         | Calendar scrape (Playwright)             | 1,719 sessions                 |
| Votes                                   | Per-session JSON                         | 578,047                        |
| Initiatives                             | 4 category JSON files                    | ~480 records                   |
| Organ members                           | Export POST (5 organ types)              | 253                            |
| Interest declarations (activities)      | `docacteco__*.json`                      | 344/408 deputies matched       |
| Interest declarations (PDFs)            | Profile pages (Playwright)               | 350 active, 58 inactive        |
| Interventions (metadata)                | `IntervencionesCronologicamente__*.json` | 35,287 bulk rows               |
| Interventions (text)                    | HTML session pages (Playwright)          | ~93,000 speeches               |
| Government members                      | Derived from bulk intervention JSON      | 113 records                    |
| Parties                                 | Static map (`config/party-parents.ts`)   | 16 parties, all XV legislature |

---

## Known Gaps

1. **Historical legislators (I–XIV)** — the `Diput__*.json` file has 6,321
   records across all legislatures but only 6 fields (name, legislature, dates).
   Ingesting would enable linking external witnesses who were former deputies to
   their Person records.

2. **`docbienes` (assets declarations)** — real estate, bank accounts,
   securities, movable assets data exists only as PDFs. No structured bulk JSON
   available. Requires PDF parsing (planned, not implemented).

3. **Government composition timeline** — `GovernmentMember` records are derived
   from intervention `CARGOORADOR` field. Start/end dates are approximated from
   first/last session appearance. La Moncloa has official data but only as HTML.

4. **`Intervention.organ`, `videoUrl`, `startTime`, `endTime`** — these come
   from the bulk JSON via stream join. The stream join currently has ordering
   issues (detail records may arrive before bulk metadata completes). Properly
   resolved in the target architecture via side inputs.

5. **`Party.parentId`** — `PARTY_PARENTS` in `config/party-parents.ts` maps
   regional PSOE branches to their parent, but `parentId` resolution in
   `upsertParties` may miss some mappings. Verify after full run.

6. **`intervention-detail` speech parsing** — the regex
   `/((?:El|La) señor[a]? [A-ZÁÉÍÓÚÑ]{2}[A-ZÁÉÍÓÚÑ\s]*(?:\([^)]+\))?:)/g`
   correctly identifies most speakers but misses some edge cases. Documented
   transcription errors are handled in `corrections/name-overrides.ts`.

---

## Corrections Files

Manual corrections for source data errors live in
`apps/ingestion/src/corrections/`:

### `name-overrides.ts`

Maps transcript speaker names (ALL-CAPS) to canonical `Person.name` format for
known transcription errors:

- Compound surnames transcribed without hyphen
- OCR errors (spaces inserted mid-word)
- Catalan terminal consonants added incorrectly
- Former minister names for `GovernmentMember` creation

### `person-merges.ts` (planned)

Documents known cases where two `Person` records represent the same real person
and should be merged via `mergePersons(keepId, mergeId)`.

---

## Source Aliases

| Alias           | Sources                                                 | Purpose                     |
| --------------- | ------------------------------------------------------- | --------------------------- |
| `deputies`      | `person`, `person-detail`                               | Full deputy profile         |
| `parties`       | `person`, `person-detail`                               | Party data extraction       |
| `speeches`      | `intervention-detail`                                   | Session transcript scraping |
| `interventions` | `intervention`, `intervention-detail`                   | Full intervention pipeline  |
| `declarations`  | `interest-declarations`, `interest-declarations-detail` | Interest declarations       |
| `all`           | all sources                                             | Full ingestion              |

---

## Validation Modes

All bulk JSON retrievers support two validation modes via `--validation` CLI
flag:

- **`soft` (default)** — invalid records are logged and skipped; pipeline
  continues
- **`strict`** — invalid records throw; pipeline aborts

Use `--validation=strict` in CI to surface data quality issues early.

---

## References

- [Beam Programming Guide — Additional Outputs](https://beam.apache.org/documentation/programming-guide/#additional-outputs)
- [Beam Programming Guide — Side Inputs](https://beam.apache.org/documentation/programming-guide/#side-inputs)
- [dbt Guide to Surrogate Keys](https://www.getdbt.com/blog/guide-to-surrogate-key)
- [DDD: Entity identity before being persisted](https://stackoverflow.com/questions/21250666/ddd-entity-identity-before-being-persisted)
- congreso.es opendata: `https://www.congreso.es/es/opendata`

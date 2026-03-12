# Party Scraper — Design

**Date:** 2026-03-12

---

## Problem

The `Party` model exists in the schema but is never populated. `Deputy.partyId`
is always `null`. Party-level analytics (e.g. "how did PP vote on X") must use
raw denormalized string fields (`deputyGroup`, `partyGroup`) which are
inconsistently formatted across data sources.

---

## Data Sources

The Congress opendata portal has no dedicated party endpoint. Party data is
embedded in the deputy datasets:

| Source                             | Field                | Value example        | Notes                            |
| ---------------------------------- | -------------------- | -------------------- | -------------------------------- |
| `DiputadosActivos` JSON (opendata) | `FORMACIONELECTORAL` | `"PP"`, `"PSC-PSOE"` | Short acronym; official opendata |
| Deputy detail page                 | `FORMACION`          | `"Partido Popular"`  | Full name; scraped from HTML     |

The `person` retriever already emits `FORMACIONELECTORAL`. The `person-detail`
retriever already emits both `FORMACION` and `FORMACIONELECTORAL`. No new finder
or URL is needed.

---

## Key Finding: Groups ≠ Formations

Parliamentary groups and electoral formations are not 1:1:

- **Grupo Parlamentario Socialista** contains 6 formations: `PSOE`, `PSC-PSOE`,
  `PSE-EE (PSOE)`, `PsdeG-PSOE`, `PSIB-PSOE`, `PSN-PSOE`. Regional branches of
  the same party family — publicly treated as one party in media and analytics.
- **Grupo Parlamentario Mixto** contains `SUMAR`, `UPN`, `BNG`, `CCa` —
  genuinely distinct parties grouped together by parliamentary rules.

`FORMACIONELECTORAL` (not `GRUPOPARLAMENTARIO`) is the correct field for
`Party`.

---

## Data Model Changes

### `Party` schema

```prisma
model Party {
  id        String   @id @default(cuid())
  name      String?           // Full name, e.g. "Partido Popular" (nullable until enriched by person-detail)
  shortName String   @unique  // Acronym from opendata, e.g. "PP" — natural key
  parentId  String?           // FK to Party.id for regional branches (e.g. PSC-PSOE → PSOE)
  parent    Party?   @relation("PartyAffiliation", fields: [parentId], references: [id])
  children  Party[]  @relation("PartyAffiliation")
  ...
}
```

`shortName` is the natural key — it is what the opendata reliably provides.
`name` starts null and is enriched when `person-detail` data arrives. `parentId`
models the canonical parent relationship (e.g. `PSC-PSOE → PSOE`).

### Parent-child mapping

The parent-child relationship cannot be derived automatically from source data.
It is maintained as a static hardcoded map in:

```
apps/ingestion/src/config/party-parents.ts
```

Initial contents (current XV legislature):

```ts
export const PARTY_PARENTS: Record<string, string> = {
  'PSC-PSOE': 'PSOE',
  'PSE-EE (PSOE)': 'PSOE',
  'PsdeG-PSOE': 'PSOE',
  'PSIB-PSOE': 'PSOE',
  'PSN-PSOE': 'PSOE',
};
```

This file requires a manual commit when new parties enter parliament.

---

## Pipeline Design

No new finder is needed. The party pipeline merges the outputs of two existing
retrievers:

```
person finder ──share()── person retriever ──┐
                                              ├── merge() ── partyProcessor ── persistParties()
person-detail finder ──share()── person-detail retriever ──┘
```

`runPartyPipeline()` in `main.ts`:

```ts
const personUrls$ = personFinder(options).pipe(share());
const detailUrls$ = personDetailFinder(options).pipe(share());

const person$ = personUrls$.pipe(
  mergeMap((url) => personRetriever({ url, ...options })),
);
const detail$ = detailUrls$.pipe(
  mergeMap((url) => personDetailRetriever({ url, ...options })),
);

await lastValueFrom(
  merge(person$, detail$).pipe(partyProcessor, persistParties()),
);
```

---

## Components

### `apps/ingestion/src/config/party-parents.ts` _(new)_

Static `Record<string, string>` mapping regional `shortName` → canonical parent
`shortName`. Manually maintained per legislature.

### `apps/ingestion/src/processors/party.ts` _(new)_

```ts
type Input = PersonModel | PersonDetailModel;
const processor: Processor<Input, PartyInput> = ...
```

- Accepts the union of `PersonModel` (has `FORMACIONELECTORAL`) and
  `PersonDetailModel` (has `FORMACIONELECTORAL` + `FORMACION`)
- Extracts `shortName` from `FORMACIONELECTORAL` in both cases
- Extracts `name` from `FORMACION` when available (PersonDetailModel only)
- Deduplicates by `shortName` — merges `name` into an existing entry if a richer
  record arrives later
- Applies `PARTY_PARENTS` map to set `parentShortName`
- Emits one `PartyInput` per unique `shortName` on stream completion

### `packages/database/src/repositories/parties.ts` _(new)_

`upsertParties(records: PartyInput[])`:

1. **First pass** — upsert all records by `shortName` (without `parentId`)
2. **Second pass** — for each record with a `parentShortName`, look up the
   parent's DB id and set `parentId`

This two-pass approach avoids ordering dependencies between parent and child
rows.

### `packages/database/src/validation/schemas.ts` _(modified)_

Add `PartyInputSchema`:

```ts
export const PartyInputSchema = z.object({
  name: z.string().optional(),
  shortName: z.string(),
  parentShortName: z.string().optional(),
});
export type PartyInput = z.infer<typeof PartyInputSchema>;
```

### `apps/ingestion/src/sinks/database.ts` _(modified)_

Add `persistParties()` operator — buffers records and calls `upsertParties()`.

### `packages/database/src/index.ts` _(modified)_

Export `upsertParties` and `PartyInput`.

### `apps/ingestion/src/main.ts` _(modified)_

- Import `personDetailFinder` and `personDetailRetriever`
- Add `runPartyPipeline()` as described above
- Register `party` in the `pipelines` map

---

## Error Handling

- Unknown `parentShortName` values (not yet in DB at second pass time) are
  stored with `parentId: null` and resolved on the next run
- Records missing `shortName` are skipped with a validation error log
- The processor deduplicates silently — no error on duplicate `shortName`

---

## Out of Scope

- Linking `Deputy.partyId` — this requires a separate reconciliation step after
  parties are populated, and is not part of this design
- Party website URL — visible on deputy detail pages but sourced from an
  undocumented internal page structure; not included
- Historical legislature party data — only the current active deputies dataset
  is used; past legislatures are not scraped for party data

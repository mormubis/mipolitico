# Data Model

Analysis of the current database schema
(`packages/database/prisma/schema.prisma`), its design rationale, known gaps,
and recommendations for future evolution.

---

## Current Models

```
Person ──────────────── Deputy ── InterestDeclaration ─┬─ RealEstateAsset
  │                       │                             ├─ MovableAsset
  ├─ Speech               └── Party ──(parent)── Party   ├─ Security
  └─ OrganMember                                        ├─ BankAccount
                                                        ├─ ProfessionalActivity
VotingSession ── Vote                                   └─ IncomeSource

Initiative

ScraperMetadata
```

---

## What Is Working Well

**`Person` as an identity anchor.** Deputies, speeches, and organ members all
link to a single `Person` row. This makes cross-domain queries possible even
before full entity resolution is done. The nullable `personId` pattern on
`Speech` and `OrganMember` is intentional and correct — it allows records to be
stored immediately, with reconciliation deferred.

**Per-legislature `Deputy` terms.** One `Deputy` row per
`(person, legislature, startDate)` correctly models that a person can serve in
multiple non-consecutive legislatures with different affiliations each time.

**Denormalized `Vote` records.** Storing `deputyName` and `deputyGroup` as
strings (no FK to `Person`/`Deputy`) is the right call for voting history. Group
affiliations change; deputies leave office; the vote was cast at a specific
moment in time. Denormalization preserves the historical record exactly as it
occurred.

**`VotingSession` aggregate totals.** Pre-computing `totalFor`, `totalAgainst`,
etc. on the session row avoids expensive aggregation queries for the most common
analytics use case.

**Child tables for `InterestDeclaration`.** Normalizing asset categories
(`RealEstateAsset`, `Security`, etc.) into separate tables makes them
individually queryable without JSON parsing. The replace-on-upsert strategy
(delete children, re-insert) is pragmatic for a data source that does not
provide stable child IDs.

---

## Gaps and Risks

### 1. No stable deputy identifier in the DB

`Person` is deduplicated by `name` (a string). The Congress opendata portal does
not expose any stable identifier for deputies — neither career-wide nor
per-legislature. `codParlamentario` appears in the `searchDiputados` response,
but that is an undocumented internal search API intercepted via Playwright, not
a published opendata endpoint. It carries no stability guarantee and should not
be stored or relied upon.

**Risk:** Two deputies with the same name would collide into one `Person` row.
The schema comment acknowledges this as acceptable at ~350 deputies per
legislature. There is no available remedy from the source data.

**Recommendation:** Accept name-based deduplication on `Person` as a known
limitation. Do not store `codParlamentario`. If a name collision is ever
detected, it must be handled manually or via an additional disambiguating field
(e.g. constituency + legislature).

### 2. `InterestDeclaration` links to `Deputy` (a term), not `Person`

`InterestDeclaration.deputyId` references `Deputy.id`. This is intentional and
correct: declarations are filed per active deputy term. A person re-elected to a
new legislature must file a new declaration, so the declaration is scoped to the
legislative term, not the person's career. Linking to `Deputy` captures both the
person and the legislature implicitly via the existing `Deputy → Person`
relation.

Querying "all declarations ever filed by person X" requires joining through
`Deputy → Person`, which is one extra hop but semantically accurate.

**No change recommended.** The current design is correct.

### 3. `Vote` has no reconcilable identifier for future person linkage

The schema doc says "Deputy reconciliation happens at analysis time, not
storage." This is a reasonable deferral, but `Vote` stores only `deputyName` (a
string) and `deputySeat` (a seat number). Neither is a stable identifier: names
change format across data sources, and seat numbers are re-assigned each
legislature.

**Recommendation:** Accept the current design. The voting JSON does not provide
a stable deputy identifier beyond name and seat number. Do not add a FK to
`Deputy` or `Person` unless the source data provides a reliable join key.

### 4. `Speech.sessionId` is a freeform string with no referential integrity

Speeches come from a different scraper than `VotingSession`, so there is no FK
relationship. `sessionId` on `Speech` is a string identifier from the
intervention scraper, not an ID from the `VotingSession` table. This is a known
deliberate trade-off.

**Consequence:** There is no DB-level way to join speeches to voting sessions
even when they occur in the same plenary sitting. A join would require matching
on date and session number, which is fragile.

**Recommendation:** If both scrapers ever produce a stable common session
identifier (e.g., a plenary session number), add a `plenarySessionId String?`
field to both `Speech` and `VotingSession` to enable future joins. For now,
document this gap and accept it.

### 5. `Party` model — resolved

The `Party` model is now populated via the party scraper (`runPartyPipeline`).
Formation data is sourced from two streams:

- `person` retriever — provides `shortName` (`FORMACIONELECTORAL`)
- `person-detail` retriever — provides `name` (full name via `FORMACION`) and
  `shortName`

A static config (`apps/ingestion/src/config/party-parents.ts`) maps PSOE
regional branches to their canonical parent. `Deputy.partyId` reconciliation
(linking deputies to their `Party` row) is a future post-ingestion step — see
next steps.

### 6. No link between `Initiative` and `VotingSession`

An initiative (Proyecto de Ley) passes through plenary votes. There is no
relationship between `Initiative` and `VotingSession` / `Vote`. It is not
possible to query "which deputies voted against initiative X."

**Recommendation:** The Congress open data provides enough information to join
these — the voting session title (`VotingSession.title`) often contains the
initiative reference. A future reconciliation step could add an optional
`initiativeId String?` FK to `VotingSession`. This is post-ingestion enrichment,
not a scraper change.

### 7. `Initiative` deduplication — resolved

The `Initiative` model now uses two independent deduplication keys:

- `expedienteNumero` — for parliamentary bills (`ProyectosDeLey`,
  `ProposicionesDeLey`, `PropuestasDeReforma`)
- `bulletinNumber` — for `Reales decretos` (no parliamentary counterpart in
  opendata)

An enrichment pass title-matches approved `Leyes`/`Leyes orgánicas` from
`IniciativasLegislativasAprobadas` against closed parliamentary bills to
populate `bulletinNumber`, `number`, `enactedDate`, and `pdfUrl`. Jaccard
similarity threshold: 0.6 (~93% hit rate on the matchable subset).

See `GLOSSARY.md#initiative-iniciativa` for the full dataset breakdown.

---

## Summary Table

| Gap                                             | Severity | Recommended Action                                                                                                     |
| ----------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| No stable deputy identifier available           | —        | `codParlamentario` is internal API only; name dedup on `Person` accepted as known limitation                           |
| `InterestDeclaration` → `Deputy` (term-scoped)  | —        | Correct by design                                                                                                      |
| `Vote` has no stable person identifier          | Low      | Accept; store source ID if available                                                                                   |
| `Speech.sessionId` has no referential integrity | Low      | Accept; document for future                                                                                            |
| `Party` model                                   | —        | Populated via party scraper; `parentId` self-relation models regional branches                                         |
| `Initiative` ↔ `VotingSession` unlinked        | Low      | Future enrichment step                                                                                                 |
| `Initiative` deduplication                      | —        | Fixed: `expedienteNumero` for parliamentary bills, `bulletinNumber` for Reales decretos; enrichment pass links the two |

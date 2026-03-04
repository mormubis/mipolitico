# Data Model

Analysis of the current database schema
(`packages/database/prisma/schema.prisma`), its design rationale, known gaps,
and recommendations for future evolution.

---

## Current Models

```
Person ──────────────── Deputy ── InterestDeclaration ─┬─ RealEstateAsset
  │                       │                             ├─ MovableAsset
  ├─ Speech               └── Party (nullable)          ├─ Security
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

`Person` is deduplicated by `name` (a string). The Congress assigns each deputy
a `codParlamentario` (an integer) that is stable across legislatures and
uniquely identifies them on the congress website. This code is used in scraper
URLs but never stored in the database.

**Risk:** Two deputies with the same name would collide into one `Person` row.
The schema comment acknowledges this as acceptable at ~350 deputies per
legislature. More critically, there is no way to look up a DB record from a
scraped `codParlamentario` without doing a name-based fuzzy match.

**Recommendation:** Add `codParlamentario Int? @unique` to `Person` (or
`Deputy`). Populate it from the `person-detail` finder which already has this
value. This gives a stable, unambiguous join key between scraped data and DB
records, and removes the name-collision risk.

### 2. `InterestDeclaration` links to `Deputy` (a term), not `Person`

`InterestDeclaration.deputyId` references `Deputy.id`. A declaration is filed
annually by a person regardless of whether they are currently serving — it
belongs to the person's career, not to a specific legislative term. If a deputy
serves in legislature XIV and XV, their XIV declarations and XV declarations
link to different `Deputy` rows, making it impossible to query "all declarations
ever filed by person X" without joining through `Deputy → Person`.

**Recommendation:** Change `InterestDeclaration.deputyId` to reference
`Person.id` directly. Rename the field to `personId` for consistency with
`Speech` and `OrganMember`.

### 3. `Vote` has no reconcilable identifier for future person linkage

The schema doc says "Deputy reconciliation happens at analysis time, not
storage." This is a reasonable deferral, but `Vote` stores only `deputyName` (a
string) and `deputySeat` (a seat number). Neither is a stable identifier: names
change format across data sources, and seat numbers are re-assigned each
legislature.

**Recommendation:** Store `deputyGroup` (already present) and additionally any
stable identifier that the source provides at ingestion time — for example, the
`codParlamentario` if it appears in the voting JSON. If not available in the
source, accept the current design. Do not add a FK to `Deputy` or `Person`
unless the source data provides a reliable join key.

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

### 5. `Party` model is unpopulated

`Deputy.partyId` is always `null` — there is no party scraper. `OrganMember` and
`Vote` store `partyGroup`/`deputyGroup` as raw strings. The `Party` model exists
in the schema but has no ingestion path.

**Consequence:** Party-level analytics (e.g., "how did PP vote on X") must use
the raw string fields, which are inconsistently formatted across sources.

**Recommendation:** Either remove `Party` and `Deputy.partyId` until a scraper
exists, or document the model as a placeholder. Do not leave it silently empty —
it creates confusion about whether party data is expected to be present.

### 6. No link between `Initiative` and `VotingSession`

An initiative (Proyecto de Ley) passes through plenary votes. There is no
relationship between `Initiative` and `VotingSession` / `Vote`. It is not
possible to query "which deputies voted against initiative X."

**Recommendation:** The Congress open data provides enough information to join
these — the voting session title (`VotingSession.title`) often contains the
initiative reference. A future reconciliation step could add an optional
`initiativeId String?` FK to `VotingSession`. This is post-ingestion enrichment,
not a scraper change.

### 7. `Initiative.bulletinNumber` used as deduplication key, but can be null

The unique constraint is `(legislature, bulletinNumber)`. When `bulletinNumber`
is null, this constraint does not apply (SQL NULLs are not considered equal in
unique constraints), meaning multiple null-bulletinNumber rows for the same
legislature can exist. The repository skips records without a bulletin number,
which avoids duplicates at the cost of data loss.

**Recommendation:** Investigate whether the source data provides an alternative
stable identifier for initiatives without a bulletin number (e.g., an expedient
number). If yes, add it as a secondary deduplication key. If no, document the
known loss explicitly.

---

## Summary Table

| Gap                                                     | Severity | Recommended Action                   |
| ------------------------------------------------------- | -------- | ------------------------------------ |
| No `codParlamentario` stored                            | High     | Add to `Person` or `Deputy`          |
| `InterestDeclaration` → `Deputy` instead of `Person`    | Medium   | Relink to `Person`                   |
| `Vote` has no stable person identifier                  | Low      | Accept; store source ID if available |
| `Speech.sessionId` has no referential integrity         | Low      | Accept; document for future          |
| `Party` model unpopulated                               | Medium   | Remove or build scraper              |
| `Initiative` ↔ `VotingSession` unlinked                | Low      | Future enrichment step               |
| `Initiative` deduplication fails on null bulletinNumber | Medium   | Find alternative key                 |

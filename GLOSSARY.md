# Glossary

Spanish Congress political terminology used throughout this codebase.

---

## Electoral Formation (`formacionElectoral`)

The coalition or party list a deputy was elected under — what appeared on the
ballot during the general election. In Spain, parties often run under coalition
names rather than their individual party name. This is the closest concept to
"party" in the colloquial sense.

Examples: `"Partido Popular"`, `"Junts per Catalunya"`, `"Sumar"`

---

## Parliamentary Group (`grupoParlamentario`)

How deputies organize themselves on the Congress floor after the election. Not
the same as the electoral formation because:

- Multiple parties can join forces into a single parliamentary group.
- A minimum of 15 deputies is required to form an independent group — parties
  below that threshold are assigned to the **Grupo Mixto** (Mixed Group).
- Deputies can switch groups after being elected (rare).

Parliamentary groups are the operative unit in Congress: they negotiate
legislation, hold speaking time, and cast collective votes.

Examples: `"Grupo Popular"`, `"Grupo Socialista"`, `"Grupo Mixto"`

---

## Party (`partido`)

A formal political party as a registered legal entity. Distinct from electoral
formation (which may be a coalition of multiple parties) and from parliamentary
group (which is a congressional organizing unit).

In the data model, `Party` is a separate entity used for normalization. The
`Deputy.partyId` field links a deputy to their party, but this reconciliation is
done as a post-ingestion step — at scrape time only `electoralFormation` and
`parliamentaryGroup` strings are available from the source data.

Examples: `"Partido Popular"`, `"Partido Socialista Obrero Español"`,
`"Esquerra Republicana de Catalunya"`

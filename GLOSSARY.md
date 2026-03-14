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

---

## Initiative (`iniciativa`)

A legislative act or proposal tracked by the Congress. The opendata portal
publishes four separate JSON datasets, each with a different schema and
deduplication key.

### Parliamentary bills (keyed by `NUMEXPEDIENTE`)

These go through the full parliamentary process (committee, amendments, plenary
vote). Format: `tipo/sequential/version` e.g. `121/000009/0000`.

| Dataset               | `TIPO` code | Who proposes                                  |
| --------------------- | ----------- | --------------------------------------------- |
| `ProyectosDeLey`      | `121`       | Government                                    |
| `ProposicionesDeLey`  | `122`       | Parliamentary groups or deputies              |
| `PropuestasDeReforma` | —           | Regional parliaments (Estatutos de Autonomía) |

These records have rich parliamentary history (`TRAMITACIONSEGUIDA`,
`SITUACIONACTUAL`, `COMISIONCOMPETENTE`, etc.) but **no `NUMERO_BOLETIN`** —
even when approved. `SITUACIONACTUAL: "Cerrado"` with
`RESULTADOTRAMITACION: "Aprobado"` indicates a bill that was passed.

### Enacted laws and executive instruments (keyed by `NUMERO_BOLETIN`)

Sourced from `IniciativasLegislativasAprobadas`. These are BOE-centric records
with minimal fields (`TIPO`, `NUMERO_LEY`, `TITULO_LEY`, `NUMERO_BOLETIN`,
`FECHA_BOLETIN`, `FECHA_LEY`, `PDF`). **No `NUMEXPEDIENTE`**.

| `TIPO`            | Description                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Leyes`           | Ordinary laws passed from a Proyecto or Proposición de Ley                                                             |
| `Leyes orgánicas` | Organic laws (require absolute majority)                                                                               |
| `Reales decretos` | Executive instruments issued by the Government — **bypass parliament**, no parliamentary history available in opendata |

### Lifecycle: parliamentary bill → enacted law

When a `ProyectoDeLey` or `ProposicionesDeLey` is approved, it appears in both
datasets — but **there is no shared structured key** between them. The
`IniciativasLegislativasAprobadas` record has no `NUMEXPEDIENTE`, and the
parliamentary record has no `NUMERO_BOLETIN`. Reconciliation requires title
matching (reliable for Leyes/Leyes orgánicas, ~93% hit rate on the matchable
subset).

### Data model implication

The `Initiative` table uses **two independent deduplication keys**:

- `expedienteNumero` — for parliamentary bills (3 opendata datasets)
- `bulletinNumber` — for `Reales decretos` (no parliamentary counterpart)

When a parliamentary bill is enriched via `IniciativasLegislativasAprobadas`
title matching, `bulletinNumber`, `numeroLey`, `fechaLey`, and `pdfUrl` are
populated on the existing row. `Reales decretos` are stored with only
`bulletinNumber` and no parliamentary history fields.

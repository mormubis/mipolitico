# Initiative Deduplication Fix — Design

**Date:** 2026-03-14

---

## Problem

The `Initiative` model uses `(legislature, bulletinNumber)` as its only
deduplication key. Three of the four initiative opendata datasets
(`ProyectosDeLey`, `ProposicionesDeLey`, `PropuestasDeReforma`) have no
`NUMERO_BOLETIN` — they use `NUMEXPEDIENTE` instead. The repository skips all
records without a bulletin number, silently dropping 408 out of 511 initiatives
(80%) from every scrape run.

See [GLOSSARY.md](../../GLOSSARY.md#initiative-iniciativa) for full terminology
and dataset descriptions.

---

## Data Sources

| Dataset                            | Records | Key              | Parliamentary history |
| ---------------------------------- | ------- | ---------------- | --------------------- |
| `ProyectosDeLey`                   | 87      | `NUMEXPEDIENTE`  | Full                  |
| `ProposicionesDeLey`               | 319     | `NUMEXPEDIENTE`  | Full                  |
| `PropuestasDeReforma`              | 2       | `NUMEXPEDIENTE`  | Full                  |
| `IniciativasLegislativasAprobadas` | 103     | `NUMERO_BOLETIN` | None (BOE-centric)    |

Of the 103 approved records: 17 Leyes, 10 Leyes orgánicas, 76 Reales decretos.
`Reales decretos` have no parliamentary counterpart in the opendata portal.

There is **no shared structured key** between `IniciativasLegislativasAprobadas`
and the three parliamentary datasets. Reconciliation requires title matching,
which achieves ~93% hit rate on the matchable subset (Leyes + Leyes orgánicas).

---

## Design

### Schema (`Initiative` model)

Add `expedienteNumero` field. Add `situacion` and `resultadoTramitacion` fields
for parliamentary status. Add two independent unique constraints. Keep existing
`bulletinNumber`.

```prisma
model Initiative {
  id                   String    @id @default(cuid())
  legislature          Int
  tipo                 String
  /// Initiative title. For parliamentary bills: OBJETO. For approved laws: TITULO_LEY.
  title                String
  /// Parliamentary expedient number (e.g. "121/000009/0000").
  /// Present for ProyectosDeLey, ProposicionesDeLey, PropuestasDeReforma.
  /// Null for Reales decretos.
  expedienteNumero     String?
  /// BOE bulletin number. Present for Reales decretos and enacted laws.
  /// Populated via title-match enrichment for parliamentary bills.
  bulletinNumber       String?
  bulletinDate         DateTime?
  /// Law number (e.g. "9" for Ley 9/2025). Null until enriched.
  number               String?
  enactedDate          DateTime?
  pdfUrl               String?
  /// Current parliamentary status (e.g. "Cerrado", "Comisión de Justicia\nInforme").
  /// Null for Reales decretos.
  situacion            String?
  /// Parliamentary outcome (e.g. "Aprobado con modificaciones\n16/12/2025").
  /// Null for Reales decretos.
  resultadoTramitacion String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@unique([legislature, expedienteNumero])
  @@unique([legislature, bulletinNumber])
}
```

The two unique constraints are safe because the two record types are disjoint:
parliamentary bills always have `expedienteNumero` and never have
`bulletinNumber` at scrape time; `Reales decretos` always have `bulletinNumber`
and never have `expedienteNumero`.

---

### Validation (`InitiativeInputSchema`)

Replace the single schema with a discriminated union:

```ts
// Parliamentary bill (ProyectosDeLey, ProposicionesDeLey, PropuestasDeReforma)
export const ParliamentaryInitiativeSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  NUMEXPEDIENTE: z.string(),
  OBJETO: z.string(),
  SITUACIONACTUAL: z.string().optional(),
  RESULTADOTRAMITACION: z.string().optional(),
  FECHAPRESENTACION: z.string().optional(),
});

// Approved law / Real decreto (IniciativasLegislativasAprobadas)
export const ApprovedLawSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  TITULO_LEY: z.string(),
  NUMERO_BOLETIN: z.string(),
  NUMERO_LEY: z.string().optional(),
  FECHA_BOLETIN: z.string().optional(),
  FECHA_LEY: z.string().optional(),
  PDF: z.string().optional(),
});

export const InitiativeInputSchema = z.union([
  ParliamentaryInitiativeSchema,
  ApprovedLawSchema,
]);
export type InitiativeInput = z.infer<typeof InitiativeInputSchema>;
```

---

### Retriever (`initiatives.ts`)

No structural change — still uses `oboe` streaming and emits one record per
item. The retriever adds `LEGISLATURE` to each record and passes it through
`InitiativeInputSchema.parse`. Since the schema is now a union, Zod will
validate against whichever shape matches.

The retriever needs to handle parse failures gracefully (log + skip) rather than
throwing, since a record that matches neither schema shape should not crash the
stream.

---

### Repository (`upsertInitiatives`)

Replace the current single-path upsert with a two-path approach:

```
for each record:
  if isParliamentaryBill(record):
    upsert by (legislature, expedienteNumero)
    set title = OBJETO, situacion, resultadoTramitacion, tipo
  else (isApprovedLaw):
    upsert by (legislature, bulletinNumber)
    set title = TITULO_LEY, number, bulletinDate, enactedDate, pdfUrl, tipo
```

**Type guard:**

```ts
function isParliamentaryBill(r: InitiativeInput): r is ParliamentaryInitiative {
  return 'NUMEXPEDIENTE' in r;
}
```

**Enrichment pass** (runs after all records are upserted):

For each approved law record (`isApprovedLaw`), attempt to find an existing
parliamentary bill row by title matching:

1. Normalize the approved title by stripping the `"Ley X/YYYY, de DD de mes, "`
   prefix
2. Query all parliamentary bill rows for the same legislature that are closed
   (`situacion` contains `"Cerrado"`) and have no `bulletinNumber` yet
3. Compute Jaccard similarity (word overlap, words > 3 chars) between normalized
   titles
4. If best match score ≥ 60, update the parliamentary bill row with
   `bulletinNumber`, `number`, `enactedDate`, `pdfUrl`

The enrichment pass uses **in-memory data already in the batch** — no extra HTTP
requests. It runs within the same `upsertInitiatives` call after the two upsert
passes.

---

### Finder (`initiatives.ts`)

No change — already emits all 4 dataset URLs.

---

## What is not changing

- The `persistInitiatives` sink operator — unchanged
- The `runInitiativesPipeline` in `main.ts` — unchanged
- The `scrape:initiatives` npm script — unchanged

---

## Known limitations

- `Reales decretos` have no parliamentary history — `situacion`,
  `resultadoTramitacion`, `expedienteNumero` will always be null for them
- Title matching for enrichment is heuristic — false positives are theoretically
  possible but have not been observed in the current XV legislature data
- `PropuestasDeReforma` have very few records (2) and are Estatutos de Autonomía
  reform proposals — these will be stored correctly but are an unusual type

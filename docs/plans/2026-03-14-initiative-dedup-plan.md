# Initiative Deduplication Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Fix the initiative scraper to store all 511 initiatives across four
opendata datasets instead of silently dropping the 80% that lack a bulletin
number.

**Architecture:** Add `expedienteNumero` field and parliamentary status fields
to `Initiative`. Replace the single-schema `InitiativeInputSchema` with a
discriminated union covering both parliamentary bills and approved laws. Update
`upsertInitiatives` to route each record to the correct unique constraint, then
run an enrichment pass that title-matches approved laws against parliamentary
bills to populate `bulletinNumber`, `number`, `enactedDate`, and `pdfUrl`.

**Tech Stack:** TypeScript strict ESM, Prisma (SQLite), Zod discriminated union,
pnpm workspaces. See `docs/plans/2026-03-14-initiative-dedup-design.md` and
`GLOSSARY.md#initiative-iniciativa` for full context.

---

### Task 1: Schema — add `expedienteNumero` + parliamentary fields to `Initiative`

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Read the current `Initiative` model**

Find the `Initiative` model in `packages/database/prisma/schema.prisma`. It
currently has:

```prisma
model Initiative {
  id             String    @id @default(cuid())
  legislature    Int
  tipo           String
  number         String?
  title          String
  bulletinNumber String?
  bulletinDate   DateTime?
  enactedDate    DateTime?
  pdfUrl         String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([legislature, bulletinNumber])
}
```

**Step 2: Update the model**

Replace the `Initiative` model with:

```prisma
model Initiative {
  id                   String    @id @default(cuid())
  /// Legislature number for historical partitioning.
  legislature          Int
  /// Initiative type (e.g. "Proyecto de ley", "Leyes", "Reales decretos").
  tipo                 String
  /// Initiative title. OBJETO for parliamentary bills, TITULO_LEY for approved laws.
  title                String
  /// Parliamentary expedient number (e.g. "121/000009/0000").
  /// Present for ProyectosDeLey, ProposicionesDeLey, PropuestasDeReforma.
  /// Null for Reales decretos (no parliamentary process).
  expedienteNumero     String?
  /// BOE bulletin number. Present for Reales decretos and enacted laws.
  /// Populated via title-match enrichment for parliamentary bills.
  bulletinNumber       String?
  /// Date of official gazette publication.
  bulletinDate         DateTime?
  /// Law number (e.g. "9" for Ley 9/2025). Null until enriched.
  number               String?
  /// Date the initiative was enacted into law. Null until enriched.
  enactedDate          DateTime?
  /// URL to the official PDF. Null until enriched.
  pdfUrl               String?
  /// Current parliamentary status (e.g. "Cerrado", "Comisión de Justicia\nInforme").
  /// Null for Reales decretos.
  situacion            String?
  /// Parliamentary outcome (e.g. "Aprobado con modificaciones\n16/12/2025").
  /// Null for Reales decretos.
  resultadoTramitacion String?
  /// Timestamp of record creation.
  createdAt            DateTime  @default(now())
  /// Timestamp of last record update.
  updatedAt            DateTime  @updatedAt

  @@unique([legislature, expedienteNumero])
  @@unique([legislature, bulletinNumber])
}
```

**Step 3: Run migration**

```bash
pnpm --filter @congress/database exec prisma migrate dev --name add-initiative-expediente-and-parliamentary-fields
```

Expected: migration created and applied, no errors.

**Step 4: Regenerate Prisma client**

```bash
pnpm --filter @congress/database exec prisma generate
```

**Step 5: Commit**

```bash
git add packages/database/prisma/ && git commit -m "feat(database): add expedienteNumero and parliamentary fields to Initiative"
```

---

### Task 2: Validation — replace `InitiativeInputSchema` with discriminated union

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Read the current schema**

Find `InitiativeInputSchema` in `packages/database/src/validation/schemas.ts`.
It currently covers only the `IniciativasLegislativasAprobadas` shape.

**Step 2: Replace with discriminated union**

Replace the existing `InitiativeInputSchema` block with:

```ts
// Parliamentary bill (ProyectosDeLey, ProposicionesDeLey, PropuestasDeReforma)
export const ParliamentaryInitiativeSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  NUMEXPEDIENTE: z.string().min(1),
  OBJETO: z.string(),
  SITUACIONACTUAL: z.string().optional(),
  RESULTADOTRAMITACION: z.string().optional(),
  FECHAPRESENTACION: z.string().optional(),
});
export type ParliamentaryInitiativeInput = z.infer<
  typeof ParliamentaryInitiativeSchema
>;

// Approved law / Real decreto (IniciativasLegislativasAprobadas)
export const ApprovedLawSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  TITULO_LEY: z.string(),
  NUMERO_BOLETIN: z.string().min(1),
  NUMERO_LEY: z.string().optional(),
  FECHA_BOLETIN: z.string().optional(),
  FECHA_LEY: z.string().optional(),
  PDF: z.string().optional(),
});
export type ApprovedLawInput = z.infer<typeof ApprovedLawSchema>;

export const InitiativeInputSchema = z.union([
  ParliamentaryInitiativeSchema,
  ApprovedLawSchema,
]);
export type InitiativeInput = z.infer<typeof InitiativeInputSchema>;
```

**Step 3: Type check**

```bash
pnpm --filter @congress/database exec tsc --noEmit
```

Expected: 0 errors. If there are errors in `repositories/initiatives.ts`, that
is expected — Task 3 fixes them.

**Step 4: Commit**

```bash
git add packages/database/src/validation/schemas.ts && git commit -m "feat(database): replace InitiativeInputSchema with discriminated union"
```

---

### Task 3: Repository — update `upsertInitiatives` with two-path upsert and enrichment pass

**Files:**

- Modify: `packages/database/src/repositories/initiatives.ts`

**Step 1: Read the current repository**

Read `packages/database/src/repositories/initiatives.ts` in full. Note the
`parseDate` helper and the single-path upsert that skips records without
`NUMERO_BOLETIN`.

**Step 2: Rewrite `upsertInitiatives`**

Replace the file contents with:

```ts
import { prisma } from '../client.ts';
import {
  ApprovedLawSchema,
  InitiativeInputSchema,
  ParliamentaryInitiativeSchema,
} from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type {
  ApprovedLawInput,
  InitiativeInput,
  ParliamentaryInitiativeInput,
} from '../validation/index.ts';

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    // DD/MM/YYYY
    const [day, month, year] = parts.map(Number);
    if (day && month && year) return new Date(year, month - 1, day);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isParliamentaryBill(
  r: InitiativeInput,
): r is ParliamentaryInitiativeInput {
  return ParliamentaryInitiativeSchema.safeParse(r).success;
}

/**
 * Normalize an approved law title for matching against parliamentary bill titles.
 * Strips the "Ley X/YYYY, de DD de mes de YYYY, " prefix.
 */
function normalizeApprovedTitle(title: string): string {
  return title
    .replace(
      /^(Ley Orgánica|Ley|Real Decreto-ley|Real Decreto Legislativo|Resolución)\s+[\d/]+(?:,\s+de\s+\d+\s+de\s+\w+(?:\s+de\s+\d+)?)?,\s*/i,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a parliamentary bill title for matching against approved law titles.
 * Strips the "Proyecto de Ley", "Proposición de Ley", etc. prefix.
 */
function normalizeParliamentaryTitle(title: string): string {
  return title
    .replace(
      /^(Proyecto de Ley Orgánica|Proyecto de Ley|Proposición de Ley Orgánica|Proposición de Ley|Propuesta de Reforma de Estatuto de Autonomía|Propuesta de reforma)\s*/i,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaccard similarity: word overlap over word union.
 * Only words longer than 3 characters are considered.
 */
function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter((w) => w.length > 3));
  const setB = new Set(b.split(' ').filter((w) => w.length > 3));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

const ENRICHMENT_THRESHOLD = 0.6;

export async function upsertInitiatives(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: InitiativeInput[] = [];
  for (const record of records) {
    const result = InitiativeInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('initiatives', record, result.error);
      skipped++;
    }
  }

  const parliamentary = validRecords.filter(isParliamentaryBill);
  const approved = validRecords.filter(
    (r): r is ApprovedLawInput => !isParliamentaryBill(r),
  );

  // First pass: upsert parliamentary bills by expedienteNumero
  await prisma.$transaction(async (tx) => {
    for (const data of parliamentary) {
      await tx.initiative.upsert({
        where: {
          legislature_expedienteNumero: {
            legislature: data.LEGISLATURE,
            expedienteNumero: data.NUMEXPEDIENTE,
          },
        },
        create: {
          legislature: data.LEGISLATURE,
          tipo: data.TIPO,
          title: data.OBJETO,
          expedienteNumero: data.NUMEXPEDIENTE,
          situacion: data.SITUACIONACTUAL ?? null,
          resultadoTramitacion: data.RESULTADOTRAMITACION ?? null,
        },
        update: {
          tipo: data.TIPO,
          title: data.OBJETO,
          situacion: data.SITUACIONACTUAL ?? null,
          resultadoTramitacion: data.RESULTADOTRAMITACION ?? null,
        },
      });
      success++;
    }
  });

  // Second pass: upsert approved laws / Reales decretos by bulletinNumber
  await prisma.$transaction(async (tx) => {
    for (const data of approved) {
      await tx.initiative.upsert({
        where: {
          legislature_bulletinNumber: {
            legislature: data.LEGISLATURE,
            bulletinNumber: data.NUMERO_BOLETIN,
          },
        },
        create: {
          legislature: data.LEGISLATURE,
          tipo: data.TIPO,
          title: data.TITULO_LEY,
          bulletinNumber: data.NUMERO_BOLETIN,
          number: data.NUMERO_LEY ?? null,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
        update: {
          tipo: data.TIPO,
          title: data.TITULO_LEY,
          number: data.NUMERO_LEY ?? null,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
      });
      success++;
    }
  });

  // Enrichment pass: title-match approved Leyes/Leyes orgánicas against
  // parliamentary bills to populate bulletinNumber, number, enactedDate, pdfUrl.
  // Reales decretos (no NUMERO_LEY is not a reliable signal; use TIPO instead)
  // are skipped — they have no parliamentary counterpart.
  const enrichable = approved.filter(
    (a) => a.TIPO === 'Leyes' || a.TIPO === 'Leyes organicas',
  );

  if (enrichable.length > 0) {
    // Fetch all closed parliamentary bills without bulletinNumber for this legislature
    const closedBills = await prisma.initiative.findMany({
      where: {
        legislature: enrichable[0].LEGISLATURE,
        bulletinNumber: null,
        situacion: { contains: 'Cerrado' },
        expedienteNumero: { not: null },
      },
      select: { id: true, title: true, expedienteNumero: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const approvedLaw of enrichable) {
        const normApproved = normalizeApprovedTitle(approvedLaw.TITULO_LEY);

        let bestId: string | null = null;
        let bestScore = 0;

        for (const bill of closedBills) {
          const normBill = normalizeParliamentaryTitle(bill.title);
          const score = jaccard(normApproved, normBill);
          if (score > bestScore) {
            bestScore = score;
            bestId = bill.id;
          }
        }

        if (bestId && bestScore >= ENRICHMENT_THRESHOLD) {
          await tx.initiative.update({
            where: { id: bestId },
            data: {
              bulletinNumber: approvedLaw.NUMERO_BOLETIN,
              number: approvedLaw.NUMERO_LEY ?? null,
              bulletinDate: parseDate(approvedLaw.FECHA_BOLETIN),
              enactedDate: parseDate(approvedLaw.FECHA_LEY),
              pdfUrl: approvedLaw.PDF ?? null,
            },
          });
        } else {
          console.warn(
            `[initiatives] Could not enrich "${approvedLaw.TITULO_LEY.substring(0, 60)}" — best score: ${String(Math.round(bestScore * 100))}%`,
          );
        }
      }
    });
  }

  return { success, skipped };
}
```

**Step 3: Export new types from repositories index**

Check `packages/database/src/repositories/index.ts` — `upsertInitiatives` is
already exported. No change needed there.

Check `packages/database/src/validation/index.ts` — ensure
`ParliamentaryInitiativeInput`, `ApprovedLawInput`,
`ParliamentaryInitiativeSchema`, `ApprovedLawSchema` are exported (they will be
via `export * from './schemas.ts'`).

**Step 4: Type check**

```bash
pnpm --filter @congress/database exec tsc --noEmit
```

Expected: 0 errors.

**Step 5: Lint**

```bash
pnpm --filter @congress/database exec eslint src/repositories/initiatives.ts --max-warnings 0
```

Expected: 0 warnings.

**Step 6: Commit**

```bash
git add packages/database/src/repositories/initiatives.ts && git commit -m "feat(database): update upsertInitiatives — two-path upsert and title-match enrichment"
```

---

### Task 4: Retriever — handle both schemas in `initiatives.ts`

**Files:**

- Modify: `apps/ingestion/src/retrievers/initiatives.ts`

**Step 1: Read the current retriever**

Read `apps/ingestion/src/retrievers/initiatives.ts`. It currently calls
`InitiativeInputSchema.parse(...)` inside the oboe stream — if parse fails it
throws and crashes the stream.

**Step 2: Update to use `safeParse` and log failures**

Replace the file contents with:

```ts
import { InitiativeInputSchema } from '@congress/database';
import { Readable } from 'node:stream';
import oboe from 'oboe';
import { Observable } from 'rxjs';

import type { InitiativeInput } from '@congress/database';
import type { Retriever } from '../types.ts';

// TODO: Update legislature number when legislature XV ends (same as intervention/finder.ts)
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
            const result = InitiativeInputSchema.safeParse({
              ...(item as Record<string, unknown>),
              LEGISLATURE: CURRENT_LEGISLATURE,
            });
            if (result.success) {
              subscriber.next(result.data);
            } else {
              console.warn(
                `[initiatives] Skipping unrecognised record from ${url}: ${result.error.message}`,
              );
            }
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

**Step 3: Type check**

```bash
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors.

**Step 4: Lint**

```bash
pnpm --filter @congress/ingestion exec eslint src/retrievers/initiatives.ts --max-warnings 0
```

Expected: 0 warnings.

**Step 5: Commit**

```bash
git add apps/ingestion/src/retrievers/initiatives.ts && git commit -m "feat(ingestion): use safeParse in initiatives retriever to handle union schema"
```

---

### Task 5: Verification — full type check and lint across all packages

**Step 1: Type check all packages**

```bash
pnpm --filter @congress/database exec tsc --noEmit
pnpm --filter @congress/ingestion exec tsc --noEmit
```

Expected: 0 errors in both.

**Step 2: Lint all packages**

```bash
pnpm --filter @congress/database exec eslint src/ --max-warnings 0
pnpm --filter @congress/ingestion exec eslint src/ --max-warnings 0
```

Expected: 0 warnings in both.

**Step 3: Commit if any formatting fixes applied**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: fix lint/format after initiative dedup fix"
```

---

### Task 6: Update `docs/data-model.md`

**Files:**

- Modify: `docs/data-model.md`

**Step 1: Update the Initiative gap entry in the summary table**

Find the row:

```
| `Initiative` deduplication fails on null bulletinNumber | Medium   | Find alternative key
```

Replace with:

```
| `Initiative` deduplication                              | —        | Fixed: expedienteNumero for parliamentary bills, bulletinNumber for Reales decretos; enrichment pass links the two
```

**Step 2: Update gap section 7**

Find section
`### 7. Initiative.bulletinNumber used as deduplication key, but can be null`
and replace with a brief resolved note.

**Step 3: Commit**

```bash
git add docs/data-model.md && git commit -m "docs: mark Initiative dedup gap resolved"
```

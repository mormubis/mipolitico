# GovernmentMember Entity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Add a `GovernmentMember` model that links a `Person` to a government
role (minister, secretary of state, etc.), following the same pattern as
`Deputy` and `OrganMember`, and use it to attribute interventions by ministers
appearing in their government role.

**Architecture:** `GovernmentMember` stores one record per
`(Person, role, legislature)` combination. `Person` records are created for
government members who aren't already deputies (former ministers, current
ministers who aren't deputies). The `intervention` processor sets
`Intervention.governmentMemberId` when the speaker is matched as a government
member. Source data comes from unique `(ORADOR, CARGOORADOR)` pairs in the bulk
intervention JSON — the same stream already flowing through the `intervention`
retriever.

**Tech Stack:** Prisma (SQLite), Zod, RxJS, TypeScript.

---

## Data facts (confirmed from live data)

Current ministers with canonical names already in Person table:

- `Bolaños García, Félix` →
  `Ministro de la Presidencia, Justicia y Relaciones con las Cortes`
- `Montero Cuadrado, María Jesús` →
  `Vicepresidenta Primera del Gobierno y Ministra de Hacienda`
- `Sánchez Pérez-Castejón, Pedro` → `Presidente del Gobierno`
- `Grande-Marlaska Gómez, Fernando` → `Ministro del Interior`
- `Puente Santiago, Óscar` → `Ministro de Transportes y Movilidad Sostenible`
- `Albares Bueno, José Manuel` → `Ministro de Asuntos Exteriores...`
- `Robles Fernández, Margarita` → `Ministra de Defensa`
- `Saiz Delgado, Elma` → `Ministra de Inclusión...`

Former ministers NOT in Person table (ALL-CAPS in transcript):

- `MONTORO ROMERO` → `exministro de Hacienda y Función Pública` (Cristóbal
  Montoro)
- `FERNÁNDEZ DÍAZ` → `exministro del Interior` (Jorge Fernández Díaz)
- `RAJOY BREY` → `expresidente del Gobierno` (Mariano Rajoy)
- `DE COSPEDAL GARCÍA` → `exministra de Defensa...` (María Dolores de Cospedal)
- `SÁENZ DE SANTAMARÍA ANTÓN` → `exvicepresidenta del Gobierno` (Soraya Sáenz de
  Santamaría)
- `ILLA I ROCA` → `exministro de Sanidad` (Salvador Illa — now in
  DiputadosDeBaja!)

**Scope:** Only include roles with `Ministro/a`,
`Vicepresidente/a del Gobierno`, `Presidente del Gobierno`,
`Secretario/a de Estado` in `CARGOORADOR`. Exclude institutional heads (RTVE,
Tribunal de Cuentas), regional officials, and senators.

---

### Task 1: Add `GovernmentMember` model to Prisma schema

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add model after `OrganMember`**

```prisma
/// A person's role in the national government (minister, secretary of state, etc.).
/// Follows the same Person → role pattern as Deputy and OrganMember.
/// Multiple records per person if they held different roles (reshuffles).
///
/// Data source: ORADOR + CARGOORADOR fields from the intervention bulk JSON.
model GovernmentMember {
  id          String   @id @default(cuid())
  personId    String
  /// Official role title as it appears in the Diario de Sesiones.
  /// e.g. "Ministra de Hacienda", "Presidente del Gobierno"
  role        String
  /// Legislature number.
  legislature Int      @default(15)
  /// Timestamp of record creation.
  createdAt   DateTime @default(now())
  /// Timestamp of last record update.
  updatedAt   DateTime @updatedAt

  person      Person   @relation(fields: [personId], references: [id])
  interventions Intervention[]

  @@unique([personId, role, legislature])
}
```

**Step 2: Add `interventions` relation to `Person`**

In the `Person` model, add:

```prisma
governmentMembers GovernmentMember[]
```

**Step 3: Add optional `governmentMemberId` to `Intervention`**

In the `Intervention` model, add:

```prisma
/// Optional link to GovernmentMember when speaker appears in ministerial role.
governmentMemberId String?
governmentMember   GovernmentMember? @relation(fields: [governmentMemberId], references: [id])
```

**Step 4: Generate migration**

```bash
pnpm --filter @congress/database exec prisma migrate dev --name add_government_member
```

**Step 5: Regenerate client**

```bash
pnpm --filter @congress/database exec prisma generate
```

**Step 6: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(database): add GovernmentMember model and Intervention.governmentMemberId"
```

---

### Task 2: Add `GovernmentMemberInputSchema` to validation

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add schema**

```typescript
export const GovernmentMemberInputSchema = z.object({
  legislature: z.number().int().default(15),
  name: z.string().min(1),
  role: z.string().min(1),
});
export type GovernmentMemberInput = z.infer<typeof GovernmentMemberInputSchema>;
```

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 3: Commit**

```bash
git add packages/database/src/validation/
git commit -m "feat(database): add GovernmentMemberInputSchema"
```

---

### Task 3: Add `upsertGovernmentMembers` repository

**Files:**

- Create: `packages/database/src/repositories/governmentMembers.ts`
- Modify: `packages/database/src/repositories/index.ts`

**Step 1: Create `governmentMembers.ts`**

```typescript
import { prisma } from '../client.ts';
import { GovernmentMemberInputSchema } from '../validation/index.ts';
import { normalizeSpanishName } from '../utils/normalize.ts';

// NOTE: normalizeSpanishName lives in apps/ingestion — for the DB package
// we'll do a simple inline fallback: strip accents and uppercase
function normalizeForLookup(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function upsertGovernmentMembers(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const valid: Array<{ name: string; role: string; legislature: number }> = [];
  for (const record of records) {
    const result = GovernmentMemberInputSchema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      skipped++;
    }
  }

  for (const data of valid) {
    // Find or create Person by name
    const normalizedName = normalizeForLookup(data.name);

    // Try exact match first
    let person = await prisma.person.findUnique({ where: { name: data.name } });

    // Fallback: case-insensitive search
    if (!person) {
      const persons = await prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT id, name FROM Person
        WHERE UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          name,'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u'))
        LIKE ${normalizedName.split(' ')[0] + '%'}
        LIMIT 5
      `;
      // Find best match
      person = persons.find((p) =>
        normalizeForLookup(p.name).includes(normalizedName.split(' ')[0] ?? ''),
      )
        ? await prisma.person.findUnique({ where: { name: persons[0]!.name } })
        : null;
    }

    // Create Person if not found
    if (!person) {
      person = await prisma.person.create({
        data: { name: data.name },
      });
    }

    await prisma.governmentMember.upsert({
      where: {
        personId_role_legislature: {
          personId: person.id,
          role: data.role,
          legislature: data.legislature,
        },
      },
      create: {
        personId: person.id,
        role: data.role,
        legislature: data.legislature,
      },
      update: {},
    });
    success++;
  }

  return { success, skipped };
}

export { upsertGovernmentMembers };
```

**Step 2: Update `index.ts`**

Add:

```typescript
export { upsertGovernmentMembers } from './governmentMembers.ts';
```

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 4: Commit**

```bash
git add packages/database/src/repositories/
git commit -m "feat(database): add upsertGovernmentMembers repository"
```

---

### Task 4: Add government-members ingestion pipeline

**Files:**

- Create: `apps/ingestion/src/processors/government-members.ts`
- Modify: `apps/ingestion/src/sinks/database.ts`
- Modify: `apps/ingestion/src/sinks/index.ts`
- Modify: `apps/ingestion/src/main.ts`

The pipeline uses the EXISTING `intervention` source — it reads from the same
`intervention` bulk JSON rows. A processor extracts unique
`(ORADOR stripped, CARGOORADOR)` pairs where `CARGOORADOR` matches a government
role pattern.

**Step 1: Create processor `government-members.ts`**

```typescript
import { EMPTY, from, mergeMap, of, pipe, reduce } from 'rxjs';

import type { GovernmentMemberInput } from '@congress/database';
import type { Model as BulkModel } from '../retrievers/intervention.ts';
import type { Processor } from '../types.ts';

// Role patterns that indicate a national government member
const GOVERNMENT_ROLE_PATTERN =
  /ministro|ministra|vicepresidente|vicepresidenta del gobierno|presidente del gobierno|secretario de estado|secretaria de estado/i;

const processor: Processor<BulkModel, GovernmentMemberInput> = pipe(
  // Accumulate unique (name, role) pairs
  reduce((acc: Map<string, GovernmentMemberInput>, row) => {
    const role = row.CARGOORADOR ?? '';
    if (!role || !GOVERNMENT_ROLE_PATTERN.test(role)) return acc;

    const rawName = (row.ORADOR ?? '').replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (!rawName) return acc;

    const key = `${rawName}::${role}`;
    if (!acc.has(key)) {
      acc.set(key, { name: rawName, role, legislature: 15 });
    }
    return acc;
  }, new Map<string, GovernmentMemberInput>()),
  mergeMap((map) => (map.size > 0 ? from([...map.values()]) : EMPTY)),
);

export { processor };
```

**Step 2: Add `persistGovernmentMembers` to `sinks/database.ts`**

Import `upsertGovernmentMembers` and add:

```typescript
function persistGovernmentMembers(): Sink<unknown, PersistResult> {
  return createBatchedSink('governmentMembers', async (batch) => {
    const result = await upsertGovernmentMembers(batch);
    return { totalSuccess: result.success, totalSkipped: result.skipped };
  });
}
```

Add to export at bottom.

**Step 3: Wire in `main.ts`**

- Import `governmentMembersProcessor` from
  `'./processors/government-members.ts'`
- Import `persistGovernmentMembers` from `'./sinks/index.ts'`
- Add `'government-members': 'governmentMembers'` to `SCRAPER_TYPE_MAP`
- Add pipeline entry to `PIPELINES`:

```typescript
{
  sources: ['intervention'],
  processor: governmentMembersProcessor as OperatorFunction<unknown, unknown>,
  sink: persistGovernmentMembers(),
},
```

Note: the `intervention` source already runs as part of the `interventions`
alias. Adding a second pipeline consuming it is fine — `data$` is shared and
replayed via `share()`.

**Step 4: Type-check both packages**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/ packages/database/src/
git commit -m "feat(ingestion): add government-members pipeline from intervention bulk JSON"
```

---

### Task 5: Update intervention processor to set `governmentMemberId`

**Files:**

- Modify: `apps/ingestion/src/processors/intervention.ts`

After resolving `personId`, also look up `governmentMemberId` — if the speaker's
`speakerRole` matches a government role AND a `GovernmentMember` exists for this
person+role, set it.

**Step 1: Add `governmentMemberId` to `InterventionInputSchema`**

In `packages/database/src/validation/schemas.ts`:

```typescript
governmentMemberId: z.string().optional(),
```

**Step 2: Update `Intervention` model in Prisma**

Add the FK (already done in Task 1 — just regenerate client).

**Step 3: Update the processor's final `mergeMap`**

After resolving `personId`, also resolve `governmentMemberId`:

```typescript
mergeMap(async (enriched) => {
  // ... existing personId resolution ...

  // Resolve governmentMemberId if speaker has a role matching a government member
  let governmentMemberId: string | undefined;
  if (enriched.speakerRole) {
    const govMember = await prisma.governmentMember.findFirst({
      where: {
        person: { id: personId ?? undefined },
        role: enriched.speakerRole,
        legislature: 15,
      },
      select: { id: true },
    });
    governmentMemberId = govMember?.id;
  }

  return { ...enriched, personId, governmentMemberId };
}),
```

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/ packages/database/src/
git commit -m "feat(ingestion): set governmentMemberId on interventions by ministers"
```

---

### Task 6: Run pipeline and verify

**Step 1: Run government-members pipeline first**

```bash
pnpm --filter @congress/ingestion scrape --source=intervention
```

(This runs both the `intervention` pipeline and the new `government-members`
pipeline since both use `sources: ['intervention']`)

**Step 2: Check results**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT gm.role, p.name, COUNT(i.id) as interventions
FROM GovernmentMember gm
JOIN Person p ON gm.personId = p.id
LEFT JOIN Intervention i ON i.governmentMemberId = gm.id
GROUP BY gm.id
ORDER BY interventions DESC
LIMIT 20;
"
```

**Step 3: Re-run interventions with governmentMemberId resolution**

```bash
sqlite3 packages/database/prisma/dev.db "DELETE FROM Intervention;"
pnpm --filter @congress/ingestion scrape --source=interventions
```

**Step 4: Verify linkage improvement**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT
  COUNT(*) as total,
  COUNT(personId) as linked_person,
  COUNT(governmentMemberId) as linked_gov,
  COUNT(CASE WHEN personId IS NOT NULL OR governmentMemberId IS NOT NULL THEN 1 END) as total_linked,
  ROUND(100.0 * COUNT(CASE WHEN personId IS NOT NULL OR governmentMemberId IS NOT NULL THEN 1 END) / COUNT(*), 1) as pct
FROM Intervention;
"
```

Expected: `total_linked` significantly higher than `linked_person` alone.

**Step 5: Commit**

```bash
git commit --allow-empty -m "feat: GovernmentMember entity complete"
```

---

## Notes

**Name normalisation for former ministers:** Former ministers appear in ALL-CAPS
(`MONTORO ROMERO`, `RAJOY BREY`). The `GovernmentMemberInput.name` will store
the ALL-CAPS form as-is from the bulk JSON. The `upsertGovernmentMembers`
repository will:

1. Try exact match against `Person.name` — fails for `MONTORO ROMERO` (not in
   DB)
2. Fall back to SQL accent-insensitive search — may find partial matches
3. Create a new `Person` if no match — `Person.name = "MONTORO ROMERO"`
   (all-caps)

**Better alternative for known former ministers:** Add them to
`corrections/name-overrides.ts` with their canonical names:

```typescript
'MONTORO ROMERO': 'Montoro Romero, Cristóbal',
'RAJOY BREY': 'Rajoy Brey, Mariano',
'FERNÁNDEZ DÍAZ': 'Fernández Díaz, Jorge',
'DE COSPEDAL GARCÍA': 'De Cospedal García, María Dolores',
'SÁENZ DE SANTAMARÍA ANTÓN': 'Sáenz de Santamaría Antón, Soraya',
```

Then `upsertGovernmentMembers` can use `normalizeSpanishName` + the overrides
map to find/create persons with their canonical names.

**`ILLA I ROCA`:** Salvador Illa is in `DiputadosDeBaja` — he has a `Person`
record as `"Illa Roca, Salvador"`. The Catalan connector `i` is stripped by
`normalizeSpanishName`. This case should resolve automatically.

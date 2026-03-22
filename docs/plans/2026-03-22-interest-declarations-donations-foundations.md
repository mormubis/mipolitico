# Interest Declarations: Donations, Foundations & Observations

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Extend `InterestDeclaration` with three new child models (`Donation`,
`Foundation`, `Observation`) and update the processor to populate them from the
`docacteco` bulk JSON.

**Architecture:** Three new Prisma models follow the same pattern as existing
child models (`ProfessionalActivity`, `BankAccount`, etc.) — each has a
`declarationId` FK and belongs to one `InterestDeclaration`. The processor
groups all bulk JSON rows by deputy name; the existing `ACTIVIDAD` mapping stays
unchanged; `DONACION` rows map to `Donation`, `FUNDACIONES` to `Foundation`,
`OBSERVACIONES` to `Observation`.

**Tech Stack:** Prisma (SQLite), Zod, RxJS, TypeScript.

---

### Task 1: Add `Donation`, `Foundation`, `Observation` models to Prisma schema

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add three models and update `InterestDeclaration` relations**

Add after the `IncomeSource` model (after line 563):

```prisma
/// Gift or donation received by a deputy (Donaciones y regalos).
/// Source: TIPO=DONACION rows in the docacteco bulk JSON.
model Donation {
  id            String              @id @default(cuid())
  declarationId String
  /// Description of the gift or donation.
  description   String
  /// Name of the person or entity who gave the gift. Null if not specified.
  benefactor    String?
  /// Timestamp of record creation.
  createdAt     DateTime            @default(now())
  /// Timestamp of last record update.
  updatedAt     DateTime            @updatedAt

  /// Linked entities.
  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Foundation or association membership/contribution declared by a deputy (Fundaciones y asociaciones).
/// Source: TIPO=FUNDACIONES rows in the docacteco bulk JSON.
model Foundation {
  id            String              @id @default(cuid())
  declarationId String
  /// Name of the foundation or association receiving the contribution.
  recipient     String
  /// Description of the contribution or membership type.
  description   String?
  /// Timestamp of record creation.
  createdAt     DateTime            @default(now())
  /// Timestamp of last record update.
  updatedAt     DateTime            @updatedAt

  /// Linked entities.
  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Free-text observation added by a deputy to their interest declaration.
/// Source: TIPO=OBSERVACIONES rows in the docacteco bulk JSON.
model Observation {
  id            String              @id @default(cuid())
  declarationId String
  /// Full text of the observation.
  text          String
  /// Timestamp of record creation.
  createdAt     DateTime            @default(now())
  /// Timestamp of last record update.
  updatedAt     DateTime            @updatedAt

  /// Linked entities.
  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}
```

Also update the `InterestDeclaration` model to add the three new relations:

```prisma
  donations              Donation[]
  foundations            Foundation[]
  observations           Observation[]
```

Add these three lines after `incomeSources IncomeSource[]` at line 425.

**Step 2: Generate migration**

```bash
pnpm --filter @congress/database exec prisma migrate dev --name add_donation_foundation_observation
```

**Step 3: Regenerate Prisma client**

```bash
pnpm --filter @congress/database exec prisma generate
```

**Step 4: Commit**

```bash
git add packages/database/prisma/
git commit -m "feat(database): add Donation, Foundation, Observation models to InterestDeclaration"
```

---

### Task 2: Add Zod schemas and update `InterestDeclarationInputSchema`

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add three new input schemas before `InterestDeclarationInputSchema`**

```typescript
export const DonationInputSchema = z.object({
  benefactor: z.string().optional(),
  description: z.string(),
});
export type DonationInput = z.infer<typeof DonationInputSchema>;

export const FoundationInputSchema = z.object({
  description: z.string().optional(),
  recipient: z.string(),
});
export type FoundationInput = z.infer<typeof FoundationInputSchema>;

export const ObservationInputSchema = z.object({
  text: z.string(),
});
export type ObservationInput = z.infer<typeof ObservationInputSchema>;
```

**Step 2: Extend `InterestDeclarationInputSchema` with the three new arrays**

```typescript
export const InterestDeclarationInputSchema = z.object({
  bankAccounts: z.array(BankAccountInputSchema).optional(),
  deputyId: z.string(),
  donations: z.array(DonationInputSchema).optional(),
  foundations: z.array(FoundationInputSchema).optional(),
  incomeSources: z.array(IncomeSourceInputSchema).optional(),
  movableAssets: z.array(MovableAssetInputSchema).optional(),
  observations: z.array(ObservationInputSchema).optional(),
  pdfUrl: z.string().optional(),
  professionalActivities: z.array(ProfessionalActivityInputSchema).optional(),
  realEstate: z.array(RealEstateAssetInputSchema).optional(),
  securities: z.array(SecurityInputSchema).optional(),
  year: z.number().int(),
});
```

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 4: Commit**

```bash
git add packages/database/src/validation/schemas.ts
git commit -m "feat(database): add DonationInput, FoundationInput, ObservationInput schemas"
```

---

### Task 3: Update `upsertInterestDeclaration` repository

**Files:**

- Modify: `packages/database/src/repositories/interestDeclarations.ts`

**Step 1: Add delete + create blocks for the three new child models**

In the transaction body, after the `securities` block, add:

```typescript
await tx.donation.deleteMany({ where: { declarationId: id } });
await tx.foundation.deleteMany({ where: { declarationId: id } });
await tx.observation.deleteMany({ where: { declarationId: id } });

if (data.donations?.length) {
  await tx.donation.createMany({
    data: data.donations.map((r) => ({ declarationId: id, ...r })),
  });
}
if (data.foundations?.length) {
  await tx.foundation.createMany({
    data: data.foundations.map((r) => ({ declarationId: id, ...r })),
  });
}
if (data.observations?.length) {
  await tx.observation.createMany({
    data: data.observations.map((r) => ({ declarationId: id, ...r })),
  });
}
```

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p packages/database/tsconfig.json
```

**Step 3: Commit**

```bash
git add packages/database/src/repositories/interestDeclarations.ts
git commit -m "feat(database): persist donations, foundations, observations in upsertInterestDeclaration"
```

---

### Task 4: Update `interest-declarations` processor to map all TIPO values

**Files:**

- Modify: `apps/ingestion/src/processors/interest-declarations.ts`

**Step 1: Add mapping for DONACION, FUNDACIONES, OBSERVACIONES**

In the `Promise.all` callback, after the `professionalActivities` mapping, add:

```typescript
const donations = rows
  .filter((r) => r.TIPO === 'DONACION')
  .map((r) => ({
    benefactor: r.BENEFACTOR ?? undefined,
    description: r.DESCRIPCION ?? '',
  }));

const foundations = rows
  .filter((r) => r.TIPO === 'FUNDACIONES')
  .map((r) => ({
    description: r.DESCRIPCION ?? undefined,
    recipient: r.DESTINATARIO ?? '',
  }));

const observations = rows
  .filter((r) => r.TIPO === 'OBSERVACIONES')
  .map((r) => ({
    text: r.OBSERVACIONES ?? '',
  }));
```

**Step 2: Include new arrays in the returned `InterestDeclarationInput`**

```typescript
return {
  deputyId,
  donations: donations.length > 0 ? donations : undefined,
  foundations: foundations.length > 0 ? foundations : undefined,
  observations: observations.length > 0 ? observations : undefined,
  professionalActivities:
    professionalActivities.length > 0 ? professionalActivities : undefined,
  year,
} satisfies InterestDeclarationInput;
```

**Step 3: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/ingestion/src/processors/interest-declarations.ts
git commit -m "feat(ingestion): map DONACION, FUNDACIONES, OBSERVACIONES rows in interest-declarations processor"
```

---

### Notes

**`DESTINATARIO` null-safety:** Some `FUNDACIONES` rows may have a null
`DESTINATARIO`. The `Foundation.recipient` field is required in the schema — use
`r.DESTINATARIO ?? ''` as fallback (an empty string signals missing data without
crashing).

**`OBSERVACIONES` field name collision:** The `OBSERVACIONES` column name
matches the `TIPO` value. `r.OBSERVACIONES` is the free-text content;
`r.TIPO === 'OBSERVACIONES'` is the filter. These are two different things — be
careful not to confuse them.

**`remunerated` audit (deferred):** The `ACTIVIDAD` rows' `remunerated` field
(`SECTOR === 'PÚBLICO' || SECTOR === 'PRIVADO'`) is always `true` for any
non-null sector. This is a known issue deferred to a future audit of the source
data's actual sector values.

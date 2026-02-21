# Schema Additions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Add `Initiative`, `InterestDeclaration` (with 6 child tables), and
rename `BureauMember` → `OrganMember` with an `organType` field; wire each into
its repository, query layer, and API route.

**Architecture:** Schema changes are applied via `db:push` (no migration files —
dev-only, no prod data). Each new entity follows the existing pattern:
`schema.prisma` → repository (`upsert*`) → query (`find*`) → API route
(`register*Routes`) → `app.ts` registration. The `BureauMember` rename touches
every layer of the existing bureau stack.

**Tech Stack:** Prisma 7 + better-sqlite3 adapter, Fastify, Zod v4, TypeScript
strict mode, ESM, pnpm workspaces.

---

## Task 1: Commit pending unstaged changes

These changes exist but were never committed. Commit them now as a clean
baseline before any schema work.

**Files:**

- Modify: `apps/api/src/app.ts` (email fix)
- Modify: `apps/api/src/routes/health.ts` (data-freshness endpoint)
- Deleted: `.env`, `CLAUDE.md` (already tracked as deleted)

**Step 1: Stage and commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/health.ts .env CLAUDE.md
git commit -m "feat(api): add /health/data-freshness endpoint; fix support email"
```

Expected: commit succeeds, lint-staged runs prettier + eslint with zero
warnings.

---

## Task 2: Update schema.prisma — rename BureauMember → OrganMember

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Rename the model and add organType**

In `schema.prisma`, find the `model BureauMember` block and replace it:

```prisma
/// Represents a person's service in any congressional organ or committee position.
/// Covers Mesa del Congreso, parliamentary committees (Comisiones), Junta de
/// Portavoces, Diputación Permanente, and any other organ. Previously named
/// BureauMember — renamed to reflect that all organs are captured, not just
/// the bureau (Mesa).
///
/// Data source: bureau.ts scraper (Organos JSON)
model OrganMember {
  id          String    @id @default(cuid())
  /// Optional reference to Person. Null until entity resolution matches member name
  /// to Person records. Some members may not reconcile (deceased prior members in records).
  personId    String?
  /// Full name of the organ member. Denormalized for historical preservation.
  name        String
  /// Position held (e.g., "Presidente", "Vicepresidente", "Secretario", "Vocal").
  position    String
  /// Congressional organ/committee name (e.g., "Mesa del Congreso", "Junta de Portavoces").
  organ       String
  /// Discriminator for the type of organ. Derived from the organ name during ingestion.
  /// Values: MESA | COMISION | JUNTA_PORTAVOCES | DIPUTACION_PERMANENTE | OTHER
  organType   String    @default("OTHER")
  /// Parliamentary group (Grupo Parlamentario) at time of appointment.
  partyGroup  String
  /// Date position started.
  startDate   DateTime
  /// Date position ended. Null for currently serving members.
  endDate     DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  person      Person?   @relation(fields: [personId], references: [id])

  /// Ensures one appointment record per name/organ/position/start combination.
  /// Allows same person to hold multiple positions and enables re-appointment after gaps.
  @@unique([name, organ, position, startDate])
}
```

Also update the `Person` model's relation reference from
`bureauMembers BureauMember[]` to `organMembers OrganMember[]`.

**Step 2: Verify schema compiles**

```bash
pnpm --filter @congress/database db:generate
```

Expected: Prisma client regenerates without errors. The generated client will
have `prisma.organMember` instead of `prisma.bureauMember`.

**Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "refactor(schema): rename BureauMember to OrganMember, add organType field"
```

---

## Task 3: Update schema.prisma — add Initiative model

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add the Initiative model** (append after ScraperMetadata):

```prisma
/// Represents an approved or in-progress legislative initiative from the Spanish Congress.
/// Covers Proyectos de Ley, Proposiciones de Ley, Real Decreto-ley, and other initiative
/// types published in the congreso.es Iniciativas open data dataset.
///
/// Data source: initiatives.ts scraper (Iniciativas JSON)
model Initiative {
  id             String    @id @default(cuid())
  /// Legislature number for historical partitioning.
  legislature    Int
  /// Initiative type (e.g., "Proyecto de Ley", "Real Decreto-ley", "Proposición de Ley").
  tipo           String
  /// Law number (NUMERO_LEY). Null for non-enacted initiatives.
  number         String?
  /// Full title of the initiative (TITULO_LEY).
  title          String
  /// Official gazette bulletin number (NUMERO_BOLETIN). Used as natural deduplication key.
  bulletinNumber String?
  /// Date of official gazette publication (FECHA_BOLETIN).
  bulletinDate   DateTime?
  /// Date the initiative was enacted into law (FECHA_LEY). Null if not yet enacted.
  enactedDate    DateTime?
  /// URL to the official PDF on BOE or congreso.es.
  pdfUrl         String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  /// Natural deduplication key. Bulletin number is the most stable identifier when
  /// available. Non-enacted initiatives without a bulletin number are edge cases
  /// and accepted as a known limitation.
  @@unique([legislature, bulletinNumber])
}
```

**Step 2: Regenerate and push**

```bash
pnpm --filter @congress/database db:generate
pnpm --filter @congress/database db:push
```

Expected: `db:push` reports the new `Initiative` table created. No data loss.

**Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(schema): add Initiative model"
```

---

## Task 4: Update schema.prisma — add InterestDeclaration + child tables

**Files:**

- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add all 7 models** (append after `Initiative`):

```prisma
/// Represents a deputy's annual financial interest declaration (Registro de Intereses).
/// Each deputy files one declaration per year. Asset categories are normalized into
/// separate child tables for queryability.
///
/// Data source: interestDeclarations.ts scraper (Registro de Intereses JSON/XML)
model InterestDeclaration {
  id           String   @id @default(cuid())
  /// Reference to the Deputy who filed this declaration.
  deputyId     String
  /// Declaration year (e.g., 2024).
  year         Int
  /// URL to the official PDF declaration. May be null if only structured data available.
  pdfUrl       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  deputy              Deputy               @relation(fields: [deputyId], references: [id])
  realEstateAssets    RealEstateAsset[]
  movableAssets       MovableAsset[]
  securities          Security[]
  bankAccounts        BankAccount[]
  professionalActivities ProfessionalActivity[]
  incomeSources       IncomeSource[]

  /// One declaration per deputy per year.
  @@unique([deputyId, year])
}

/// Real estate property declared by a deputy (Bienes inmuebles).
model RealEstateAsset {
  id                String              @id @default(cuid())
  declarationId     String
  /// Property type (e.g., "Vivienda", "Garaje", "Terreno").
  propertyType      String
  /// Street address. May be partially redacted in source data.
  address           String?
  /// Surface area in square metres.
  surface           Float?
  /// Year of acquisition.
  acquisitionYear   Int?
  /// Value at time of acquisition in EUR.
  acquisitionValue  Float?
  /// Current cadastral or market value in EUR.
  currentValue      Float?
  /// Outstanding mortgage balance in EUR. Null if unencumbered.
  mortgage          Float?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  declaration       InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Movable asset declared by a deputy (Bienes muebles — vehicles, boats, art, etc.).
model MovableAsset {
  id              String              @id @default(cuid())
  declarationId   String
  /// Asset type (e.g., "Vehículo", "Embarcación", "Obra de arte").
  assetType       String
  /// Description (make/model or free-text description).
  description     String?
  /// Year of acquisition.
  acquisitionYear Int?
  /// Estimated value in EUR.
  value           Float?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  declaration     InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Securities (stocks, bonds, funds) declared by a deputy (Valores mobiliarios).
model Security {
  id              String              @id @default(cuid())
  declarationId   String
  /// Issuing entity (company, fund, or government).
  issuer          String
  /// Security type (e.g., "Acciones", "Fondos de inversión", "Deuda pública").
  securityType    String
  /// Year of acquisition.
  acquisitionYear Int?
  /// Nominal value in EUR.
  nominalValue    Float?
  /// Current market value in EUR.
  marketValue     Float?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  declaration     InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Bank account declared by a deputy (Cuentas bancarias).
/// Source data provides balance ranges rather than exact amounts.
model BankAccount {
  id            String              @id @default(cuid())
  declarationId String
  /// Financial institution name.
  institution   String
  /// Account type (e.g., "Corriente", "Ahorro", "Plazo fijo").
  accountType   String
  /// Balance range string as reported in source (e.g., "Entre 6.000 y 30.000 €").
  balanceRange  String?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Professional activity declared by a deputy (Actividades profesionales).
model ProfessionalActivity {
  id            String              @id @default(cuid())
  declarationId String
  /// Name of the organisation or entity where the activity takes place.
  entity        String
  /// Role or position held.
  position      String
  /// Date the activity started. Null if not specified.
  startDate     DateTime?
  /// Date the activity ended. Null if currently active.
  endDate       DateTime?
  /// Whether the activity is remunerated.
  remunerated   Boolean
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}

/// Income source declared by a deputy (Fuentes de ingresos).
/// Source data provides amount ranges rather than exact figures.
model IncomeSource {
  id            String              @id @default(cuid())
  declarationId String
  /// Entity or person providing the income.
  source        String
  /// Nature of the income (e.g., "Salario", "Dividendos", "Arrendamiento").
  concept       String
  /// Amount range string as reported in source (e.g., "Entre 30.001 y 60.000 €").
  amountRange   String?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  declaration   InterestDeclaration @relation(fields: [declarationId], references: [id])
}
```

Also add `interestDeclarations InterestDeclaration[]` to the `Deputy` model
relations.

**Step 2: Regenerate and push**

```bash
pnpm --filter @congress/database db:generate
pnpm --filter @congress/database db:push
```

Expected: 7 new tables created. No errors.

**Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(schema): add InterestDeclaration and 6 child asset tables"
```

---

## Task 5: Update bureau repository → organMembers.ts

**Files:**

- Rename: `packages/database/src/repositories/bureaus.ts` →
  `packages/database/src/repositories/organMembers.ts`
- Modify: `packages/database/src/repositories/index.ts`
- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Determine organType from organ name**

Add a helper that maps the `NombreOrgano` string to one of the five `organType`
values. Add this to the new `organMembers.ts`:

```ts
function deriveOrganType(organName: string): string {
  const name = organName.toLowerCase();
  if (name.includes('mesa')) return 'MESA';
  if (name.includes('comisión') || name.includes('comision')) return 'COMISION';
  if (name.includes('junta de portavoces')) return 'JUNTA_PORTAVOCES';
  if (
    name.includes('diputación permanente') ||
    name.includes('diputacion permanente')
  )
    return 'DIPUTACION_PERMANENTE';
  return 'OTHER';
}
```

**Step 2: Write `organMembers.ts`** — copy `bureaus.ts`, then:

- Rename function `upsertBureauMembers` → `upsertOrganMembers`
- Change `prisma.bureauMember.upsert` → `prisma.organMember.upsert`
- Add `organType: deriveOrganType(data.NombreOrgano)` to both `create` and
  `update` blocks
- Change `where` key from `name_organ_position_startDate` to the same (Prisma
  auto-generates this from `@@unique`)

Full file:

```ts
import { prisma } from '../client.ts';
import { BureauInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { BureauInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year!, month! - 1, day);
}

function deriveOrganType(organName: string): string {
  const name = organName.toLowerCase();
  if (name.includes('mesa')) return 'MESA';
  if (name.includes('comisión') || name.includes('comision')) return 'COMISION';
  if (name.includes('junta de portavoces')) return 'JUNTA_PORTAVOCES';
  if (
    name.includes('diputación permanente') ||
    name.includes('diputacion permanente')
  )
    return 'DIPUTACION_PERMANENTE';
  return 'OTHER';
}

export async function upsertOrganMembers(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: BureauInput[] = [];
  for (const record of records) {
    const result = BureauInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('organMembers', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      const startDate = parseSpanishDate(data.FechaAlta);
      if (!startDate) {
        skipped++;
        continue;
      }

      const person = await tx.person.findUnique({
        where: { name: data.Nombre },
      });

      const organType = deriveOrganType(data.NombreOrgano);

      await tx.organMember.upsert({
        where: {
          name_organ_position_startDate: {
            name: data.Nombre,
            organ: data.NombreOrgano,
            position: data.Cargo,
            startDate,
          },
        },
        create: {
          personId: person?.id ?? null,
          name: data.Nombre,
          position: data.Cargo,
          organ: data.NombreOrgano,
          organType,
          partyGroup: data.Grupo,
          startDate,
          endDate: parseSpanishDate(data.FechaBaja),
        },
        update: {
          personId: person?.id ?? null,
          organType,
          partyGroup: data.Grupo,
          endDate: parseSpanishDate(data.FechaBaja),
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
```

**Step 3: Update `repositories/index.ts`**

Replace:

```ts
export { upsertBureauMembers } from './bureaus.ts';
```

With:

```ts
export { upsertOrganMembers } from './organMembers.ts';
```

Delete the old `bureaus.ts` file.

**Step 4: Verify TypeScript**

```bash
pnpm --filter @congress/database lint:types
```

Expected: no errors.

**Step 5: Commit**

```bash
git add packages/database/src/repositories/
git commit -m "refactor(database): rename upsertBureauMembers to upsertOrganMembers, add organType derivation"
```

---

## Task 6: Update bureau query layer → organMembers query

**Files:**

- Rename: `packages/database/src/queries/bureaus.ts` →
  `packages/database/src/queries/organMembers.ts`
- Modify: `packages/database/src/queries/index.ts`

**Step 1: Rewrite `organMembers.ts`** — copy `bureaus.ts` then:

- Rename interface `BureauFilters` → `OrganMemberFilters`; add optional
  `organType?: string`
- Change `prisma.bureauMember` → `prisma.organMember`
- Add `organType` filter to `where`
- Rename functions `findBureauMembers` → `findOrganMembers`,
  `findBureauMemberById` → `findOrganMemberById`
- Update type imports: `BureauMember` → `OrganMember` from `@prisma/client`

Full file:

```ts
import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { OrganMember } from '@prisma/client';

export interface OrganMemberFilters {
  organ?: string;
  organType?: string;
  position?: string;
  name?: string;
}

export async function findOrganMembers(
  filters: OrganMemberFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<OrganMember>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.organ && { organ: filters.organ }),
    ...(filters.organType && { organType: filters.organType }),
    ...(filters.position && { position: filters.position }),
    ...(filters.name && { name: { contains: filters.name } }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { startDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.organMember.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.organMember.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findOrganMemberById(
  id: string,
): Promise<OrganMember | null> {
  return prisma.organMember.findUnique({ where: { id } });
}
```

**Step 2: Update `queries/index.ts`**

Check current contents of `packages/database/src/queries/index.ts` and replace
the bureaus export line:

```ts
export { findBureauMembers, findBureauMemberById } from './bureaus.ts';
```

with:

```ts
export { findOrganMembers, findOrganMemberById } from './organMembers.ts';
export type { OrganMemberFilters } from './organMembers.ts';
```

Delete the old `bureaus.ts` file.

**Step 3: Verify**

```bash
pnpm --filter @congress/database lint:types
```

**Step 4: Commit**

```bash
git add packages/database/src/queries/
git commit -m "refactor(database): rename bureau query functions to organMember, add organType filter"
```

---

## Task 7: Update API — rename /bureaus → /organs route

**Files:**

- Rename: `apps/api/src/routes/bureaus.ts` → `apps/api/src/routes/organs.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/schemas/openapi.ts`
- Modify: `apps/api/src/schemas/query.ts`

**Step 1: Update `openapi.ts`**

Rename `bureauMemberSchema` → `organMemberSchema` and add `organType` field:

```ts
export const organMemberSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique organ member identifier' },
    personId: {
      type: 'string',
      nullable: true,
      description: 'Person identifier (null if not linked)',
    },
    name: {
      type: 'string',
      description: 'Full name',
      example: 'Francina Armengol',
    },
    position: {
      type: 'string',
      description: 'Position held',
      example: 'Presidenta',
    },
    organ: {
      type: 'string',
      description: 'Congressional organ',
      example: 'Mesa del Congreso',
    },
    organType: {
      type: 'string',
      enum: [
        'MESA',
        'COMISION',
        'JUNTA_PORTAVOCES',
        'DIPUTACION_PERMANENTE',
        'OTHER',
      ],
      description: 'Type of congressional organ',
    },
    partyGroup: {
      type: 'string',
      description: 'Party/parliamentary group',
      example: 'PSOE',
    },
    startDate: {
      type: 'string',
      format: 'date-time',
      description: 'Start date of position',
    },
    endDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'End date (null if current)',
    },
  },
};
```

**Step 2: Update `query.ts`**

Rename `bureauFilterSchema` → `organFilterSchema`; add `organType` filter;
rename `bureauQuerySchema` → `organQuerySchema`:

```ts
export const organFilterSchema = z.object({
  organ: z.string().optional(),
  organType: z
    .enum([
      'MESA',
      'COMISION',
      'JUNTA_PORTAVOCES',
      'DIPUTACION_PERMANENTE',
      'OTHER',
    ])
    .optional(),
  position: z.string().optional(),
  name: z.string().optional(),
});

export const organQuerySchema = organFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);
```

**Step 3: Write `organs.ts`** — copy `bureaus.ts`, then:

- Import `findOrganMembers`, `findOrganMemberById` instead of bureau equivalents
- Import `organMemberSchema`, `organQuerySchema` instead of bureau equivalents
- Change all route paths from `/api/v1/bureaus` → `/api/v1/organs`
- Change `tags: ['bureaus']` → `tags: ['organs']`
- Rename function `registerBureauRoutes` → `registerOrganRoutes`
- Add `organType` filter to the filters object passed to `findOrganMembers`
- Update schema endpoint to `/api/v1/schema/organs`; add `organType` to fields
  array
- Update all descriptions/summaries to say "organ member" instead of "bureau
  member"

**Step 4: Update `app.ts`**

- Replace import of `registerBureauRoutes` from `./routes/bureaus.ts` with
  `registerOrganRoutes` from `./routes/organs.ts`
- Replace `{ name: 'bureaus', description: 'Bureau member endpoints' }` tag with
  `{ name: 'organs', description: 'Congressional organ member endpoints' }`
- Replace `registerBureauRoutes(app)` call with `registerOrganRoutes(app)`

Delete `routes/bureaus.ts`.

**Step 5: Verify**

```bash
pnpm --filter @congress/api lint:types
```

Expected: no errors.

**Step 6: Commit**

```bash
git add apps/api/src/
git commit -m "refactor(api): rename /bureaus to /organs, expose organType filter"
```

---

## Task 8: Add Initiative repository

**Files:**

- Create: `packages/database/src/repositories/initiatives.ts`
- Modify: `packages/database/src/repositories/index.ts`
- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add InitiativeInputSchema to `schemas.ts`**

```ts
export const InitiativeInputSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  NUMERO_LEY: z.string().optional(),
  TITULO_LEY: z.string(),
  NUMERO_BOLETIN: z.string().optional(),
  FECHA_BOLETIN: z.string().optional(),
  FECHA_LEY: z.string().optional(),
  PDF: z.string().optional(),
});
export type InitiativeInput = z.infer<typeof InitiativeInputSchema>;
```

**Step 2: Create `initiatives.ts`**

```ts
import { prisma } from '../client.ts';
import { InitiativeInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InitiativeInput } from '../validation/index.ts';

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

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

  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      // Skip if no bulletin number (cannot deduplicate)
      if (!data.NUMERO_BOLETIN) {
        skipped++;
        continue;
      }

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
          number: data.NUMERO_LEY ?? null,
          title: data.TITULO_LEY,
          bulletinNumber: data.NUMERO_BOLETIN,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
        update: {
          tipo: data.TIPO,
          number: data.NUMERO_LEY ?? null,
          title: data.TITULO_LEY,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
```

**Step 3: Update `repositories/index.ts`** — add:

```ts
export { upsertInitiatives } from './initiatives.ts';
```

**Step 4: Verify**

```bash
pnpm --filter @congress/database lint:types
```

**Step 5: Commit**

```bash
git add packages/database/src/repositories/initiatives.ts \
        packages/database/src/repositories/index.ts \
        packages/database/src/validation/schemas.ts
git commit -m "feat(database): add upsertInitiatives repository and InitiativeInputSchema"
```

---

## Task 9: Add Initiative query layer

**Files:**

- Create: `packages/database/src/queries/initiatives.ts`
- Modify: `packages/database/src/queries/index.ts`

**Step 1: Create `initiatives.ts`**

```ts
import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { Initiative } from '@prisma/client';

export interface InitiativeFilters {
  legislature?: number;
  tipo?: string;
  title?: string;
  enacted?: boolean;
}

export async function findInitiatives(
  filters: InitiativeFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<Initiative>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.legislature && { legislature: filters.legislature }),
    ...(filters.tipo && { tipo: filters.tipo }),
    ...(filters.title && { title: { contains: filters.title } }),
    ...(filters.enacted !== undefined && {
      enactedDate: filters.enacted ? { not: null } : null,
    }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { bulletinDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.initiative.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.initiative.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findInitiativeById(
  id: string,
): Promise<Initiative | null> {
  return prisma.initiative.findUnique({ where: { id } });
}
```

**Step 2: Update `queries/index.ts`** — add:

```ts
export { findInitiatives, findInitiativeById } from './initiatives.ts';
export type { InitiativeFilters } from './initiatives.ts';
```

**Step 3: Verify**

```bash
pnpm --filter @congress/database lint:types
```

**Step 4: Commit**

```bash
git add packages/database/src/queries/initiatives.ts \
        packages/database/src/queries/index.ts
git commit -m "feat(database): add findInitiatives and findInitiativeById query functions"
```

---

## Task 10: Add /initiatives API route

**Files:**

- Create: `apps/api/src/routes/initiatives.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/schemas/openapi.ts`
- Modify: `apps/api/src/schemas/query.ts`

**Step 1: Add `initiativeSchema` to `openapi.ts`**

```ts
export const initiativeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique initiative identifier' },
    legislature: {
      type: 'integer',
      description: 'Legislature number',
      example: 15,
    },
    tipo: {
      type: 'string',
      description: 'Initiative type',
      example: 'Proyecto de Ley',
    },
    number: {
      type: 'string',
      nullable: true,
      description: 'Law number (null if not enacted)',
    },
    title: { type: 'string', description: 'Full title of the initiative' },
    bulletinNumber: {
      type: 'string',
      nullable: true,
      description: 'Official gazette bulletin number',
    },
    bulletinDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Gazette publication date',
    },
    enactedDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Date enacted into law (null if pending)',
    },
    pdfUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description: 'URL to official PDF',
    },
  },
};
```

**Step 2: Add `initiativeFilterSchema` and `initiativeQuerySchema` to
`query.ts`**

```ts
export const initiativeFilterSchema = z.object({
  legislature: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  tipo: z.string().optional(),
  title: z.string().optional(),
  enacted: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .pipe(z.boolean().optional()),
});

export const initiativeQuerySchema = initiativeFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);
```

**Step 3: Create `routes/initiatives.ts`**

Model this file after `routes/deputies.ts`. Key details:

- Import `findInitiatives`, `findInitiativeById` from `@congress/database`
- Import `initiativeSchema`, `initiativeQuerySchema`
- Function name: `registerInitiativeRoutes`
- Routes: `GET /api/v1/initiatives`, `GET /api/v1/initiatives/:id`,
  `GET /api/v1/schema/initiatives`
- Tag: `initiatives`
- Cache strategy: `'historical'` (initiatives don't change once enacted; use
  `getCacheStrategy(result.data[0]?.enactedDate)` for the list)
- Filters: `legislature`, `tipo`, `title`, `enacted` (boolean)
- Schema endpoint fields: `id`, `legislature`, `tipo`, `title`,
  `bulletinNumber`, `bulletinDate`, `enactedDate`, `pdfUrl`
- Sortable: `id`, `legislature`, `tipo`, `bulletinDate`, `enactedDate`

**Step 4: Update `app.ts`**

- Add import:
  `import { registerInitiativeRoutes } from './routes/initiatives.ts';`
- Add tag:
  `{ name: 'initiatives', description: 'Legislative initiative endpoints' }`
- Add registration: `registerInitiativeRoutes(app);`

**Step 5: Verify**

```bash
pnpm --filter @congress/api lint:types
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/initiatives.ts \
        apps/api/src/app.ts \
        apps/api/src/schemas/openapi.ts \
        apps/api/src/schemas/query.ts
git commit -m "feat(api): add /initiatives route with filtering by legislature, tipo, title, enacted"
```

---

## Task 11: Add InterestDeclaration repository

**Files:**

- Create: `packages/database/src/repositories/interestDeclarations.ts`
- Modify: `packages/database/src/repositories/index.ts`
- Modify: `packages/database/src/validation/schemas.ts`

**Step 1: Add input schemas to `schemas.ts`**

The Registro de Intereses source structure is not yet fully known — we add a
flexible input schema that can be tightened when the scraper is built:

```ts
export const RealEstateAssetInputSchema = z.object({
  propertyType: z.string(),
  address: z.string().optional(),
  surface: z.number().optional(),
  acquisitionYear: z.number().int().optional(),
  acquisitionValue: z.number().optional(),
  currentValue: z.number().optional(),
  mortgage: z.number().optional(),
});

export const MovableAssetInputSchema = z.object({
  assetType: z.string(),
  description: z.string().optional(),
  acquisitionYear: z.number().int().optional(),
  value: z.number().optional(),
});

export const SecurityInputSchema = z.object({
  issuer: z.string(),
  securityType: z.string(),
  acquisitionYear: z.number().int().optional(),
  nominalValue: z.number().optional(),
  marketValue: z.number().optional(),
});

export const BankAccountInputSchema = z.object({
  institution: z.string(),
  accountType: z.string(),
  balanceRange: z.string().optional(),
});

export const ProfessionalActivityInputSchema = z.object({
  entity: z.string(),
  position: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  remunerated: z.boolean(),
});

export const IncomeSourceInputSchema = z.object({
  source: z.string(),
  concept: z.string(),
  amountRange: z.string().optional(),
});

export const InterestDeclarationInputSchema = z.object({
  DEPUTY_ID: z.string(),
  YEAR: z.number().int(),
  PDF_URL: z.string().optional(),
  REAL_ESTATE: z.array(RealEstateAssetInputSchema).optional(),
  MOVABLE_ASSETS: z.array(MovableAssetInputSchema).optional(),
  SECURITIES: z.array(SecurityInputSchema).optional(),
  BANK_ACCOUNTS: z.array(BankAccountInputSchema).optional(),
  PROFESSIONAL_ACTIVITIES: z.array(ProfessionalActivityInputSchema).optional(),
  INCOME_SOURCES: z.array(IncomeSourceInputSchema).optional(),
});
export type InterestDeclarationInput = z.infer<
  typeof InterestDeclarationInputSchema
>;
```

**Step 2: Create `interestDeclarations.ts`**

```ts
import { prisma } from '../client.ts';
import { InterestDeclarationInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InterestDeclarationInput } from '../validation/index.ts';

function parseOptionalDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function upsertInterestDeclaration(
  record: unknown,
): Promise<boolean> {
  const result = InterestDeclarationInputSchema.safeParse(record);
  if (!result.success) {
    logValidationError('interestDeclarations', record, result.error);
    return false;
  }

  const data: InterestDeclarationInput = result.data;

  await prisma.$transaction(async (tx) => {
    const declaration = await tx.interestDeclaration.upsert({
      where: { deputyId_year: { deputyId: data.DEPUTY_ID, year: data.YEAR } },
      create: {
        deputyId: data.DEPUTY_ID,
        year: data.YEAR,
        pdfUrl: data.PDF_URL ?? null,
      },
      update: { pdfUrl: data.PDF_URL ?? null },
    });

    const id = declaration.id;

    // Delete existing child records and re-insert (replace strategy)
    await tx.realEstateAsset.deleteMany({ where: { declarationId: id } });
    await tx.movableAsset.deleteMany({ where: { declarationId: id } });
    await tx.security.deleteMany({ where: { declarationId: id } });
    await tx.bankAccount.deleteMany({ where: { declarationId: id } });
    await tx.professionalActivity.deleteMany({ where: { declarationId: id } });
    await tx.incomeSource.deleteMany({ where: { declarationId: id } });

    if (data.REAL_ESTATE?.length) {
      await tx.realEstateAsset.createMany({
        data: data.REAL_ESTATE.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.MOVABLE_ASSETS?.length) {
      await tx.movableAsset.createMany({
        data: data.MOVABLE_ASSETS.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.SECURITIES?.length) {
      await tx.security.createMany({
        data: data.SECURITIES.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.BANK_ACCOUNTS?.length) {
      await tx.bankAccount.createMany({
        data: data.BANK_ACCOUNTS.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.PROFESSIONAL_ACTIVITIES?.length) {
      await tx.professionalActivity.createMany({
        data: data.PROFESSIONAL_ACTIVITIES.map((r) => ({
          declarationId: id,
          ...r,
          startDate: parseOptionalDate(r.startDate),
          endDate: parseOptionalDate(r.endDate),
        })),
      });
    }
    if (data.INCOME_SOURCES?.length) {
      await tx.incomeSource.createMany({
        data: data.INCOME_SOURCES.map((r) => ({ declarationId: id, ...r })),
      });
    }
  });

  return true;
}
```

**Step 3: Update `repositories/index.ts`** — add:

```ts
export { upsertInterestDeclaration } from './interestDeclarations.ts';
```

**Step 4: Verify**

```bash
pnpm --filter @congress/database lint:types
```

**Step 5: Commit**

```bash
git add packages/database/src/repositories/interestDeclarations.ts \
        packages/database/src/repositories/index.ts \
        packages/database/src/validation/schemas.ts
git commit -m "feat(database): add upsertInterestDeclaration repository with child table writes"
```

---

## Task 12: Add InterestDeclaration query layer

**Files:**

- Create: `packages/database/src/queries/interestDeclarations.ts`
- Modify: `packages/database/src/queries/index.ts`

**Step 1: Create `interestDeclarations.ts`**

```ts
import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { InterestDeclaration } from '@prisma/client';

export interface InterestDeclarationFilters {
  deputyId?: string;
  year?: number;
}

type DeclarationWithChildren = InterestDeclaration & {
  realEstateAssets: unknown[];
  movableAssets: unknown[];
  securities: unknown[];
  bankAccounts: unknown[];
  professionalActivities: unknown[];
  incomeSources: unknown[];
};

const INCLUDE_CHILDREN = {
  realEstateAssets: true,
  movableAssets: true,
  securities: true,
  bankAccounts: true,
  professionalActivities: true,
  incomeSources: true,
} as const;

export async function findInterestDeclarations(
  filters: InterestDeclarationFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<DeclarationWithChildren>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.deputyId && { deputyId: filters.deputyId }),
    ...(filters.year && { year: filters.year }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { year: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.interestDeclaration.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      include: INCLUDE_CHILDREN,
    }),
    prisma.interestDeclaration.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findInterestDeclarationById(
  id: string,
): Promise<DeclarationWithChildren | null> {
  return prisma.interestDeclaration.findUnique({
    where: { id },
    include: INCLUDE_CHILDREN,
  });
}
```

**Step 2: Update `queries/index.ts`** — add:

```ts
export {
  findInterestDeclarations,
  findInterestDeclarationById,
} from './interestDeclarations.ts';
export type { InterestDeclarationFilters } from './interestDeclarations.ts';
```

**Step 3: Verify**

```bash
pnpm --filter @congress/database lint:types
```

**Step 4: Commit**

```bash
git add packages/database/src/queries/interestDeclarations.ts \
        packages/database/src/queries/index.ts
git commit -m "feat(database): add findInterestDeclarations and findInterestDeclarationById queries"
```

---

## Task 13: Add /interest-declarations API route

**Files:**

- Create: `apps/api/src/routes/interestDeclarations.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/schemas/openapi.ts`
- Modify: `apps/api/src/schemas/query.ts`

**Step 1: Add schemas to `openapi.ts`**

Add a nested `interestDeclarationSchema` with inline child array schemas (model
after `votingSessionSchema` which embeds `votes`). Include all 6 child array
properties. Each child item schema lists only the non-id, non-timestamp fields
for brevity.

Key structure:

```ts
export const interestDeclarationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    deputyId: { type: 'string' },
    year: { type: 'integer', example: 2024 },
    pdfUrl: { type: 'string', format: 'uri', nullable: true },
    realEstateAssets: {
      type: 'array',
      items: {
        /* propertyType, address, surface, ... */
      },
    },
    movableAssets: {
      type: 'array',
      items: {
        /* assetType, description, value, ... */
      },
    },
    securities: {
      type: 'array',
      items: {
        /* issuer, securityType, marketValue, ... */
      },
    },
    bankAccounts: {
      type: 'array',
      items: {
        /* institution, accountType, balanceRange */
      },
    },
    professionalActivities: {
      type: 'array',
      items: {
        /* entity, position, remunerated, ... */
      },
    },
    incomeSources: {
      type: 'array',
      items: {
        /* source, concept, amountRange */
      },
    },
  },
};
```

**Step 2: Add filter schema to `query.ts`**

```ts
export const interestDeclarationFilterSchema = z.object({
  deputyId: z.string().optional(),
  year: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});

export const interestDeclarationQuerySchema = interestDeclarationFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);
```

**Step 3: Create `routes/interestDeclarations.ts`**

- Function: `registerInterestDeclarationRoutes`
- Routes: `GET /api/v1/interest-declarations`,
  `GET /api/v1/interest-declarations/:id`
- Tag: `interest-declarations`
- Cache strategy: `'historical'` (declarations are historical documents)
- No schema endpoint needed (complex nested structure; swagger auto-documents
  it)

**Step 4: Update `app.ts`**

- Import `registerInterestDeclarationRoutes` from
  `./routes/interestDeclarations.ts`
- Add tag:
  `{ name: 'interest-declarations', description: 'Deputy financial interest declaration endpoints' }`
- Register: `registerInterestDeclarationRoutes(app);`

**Step 5: Verify**

```bash
pnpm --filter @congress/api lint:types
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/interestDeclarations.ts \
        apps/api/src/app.ts \
        apps/api/src/schemas/openapi.ts \
        apps/api/src/schemas/query.ts
git commit -m "feat(api): add /interest-declarations route"
```

---

## Task 14: Full lint check across all packages

Run lint across the entire workspace to catch any cross-package breakage from
the `bureauMember` → `organMember` rename or the new exports.

**Step 1: Run lint on all packages**

```bash
pnpm --filter @congress/database lint:types
pnpm --filter @congress/api lint:types
pnpm --filter @congress/ingestion lint:types
```

Fix any errors found. Common issues:

- Any remaining reference to `prisma.bureauMember` in ingestion sinks
- Any remaining import of `upsertBureauMembers` or `findBureauMembers`

**Step 2: Commit fixes** (if any)

```bash
git add .
git commit -m "fix: resolve remaining bureau → organ rename references across packages"
```

---

## Task 15: Commit untracked ingestion files

The untracked `apps/ingestion/src/sinks/` directory and
`apps/ingestion/src/sources/voting.ts` should be reviewed and committed.

**Step 1: Review sinks directory contents**

Read each file in `apps/ingestion/src/sinks/` to understand what's there.

**Step 2: Stage and commit if complete**

If the files look complete and lint-clean:

```bash
pnpm --filter @congress/ingestion lint:types
git add apps/ingestion/src/sinks/ apps/ingestion/src/sources/voting.ts
git commit -m "feat(ingestion): add data sink implementations and voting source"
```

If files reference `upsertBureauMembers` (old name), update to
`upsertOrganMembers` before committing.

---

## Completion Check

After all tasks, verify the full workspace builds and lints clean:

```bash
pnpm --filter @congress/database lint:ci
pnpm --filter @congress/api lint:ci
pnpm --filter @congress/ingestion lint:ci
```

Expected: all pass with zero warnings.

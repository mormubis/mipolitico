# Schema Additions Design — 2026-02-21

## Context

The MiPolítico database schema currently covers five data sources from
congreso.es: Diputados (Person, Deputy, Party), Votaciones (VotingSession,
Vote), Intervenciones (Speech), Órganos (BureauMember), and scraper metadata
(ScraperMetadata).

This design adds three categories of changes to bring the schema to an "almost
final" state before ingestion work resumes:

1. **`Initiative`** — Iniciativas legislativas (laws, decrees, proposals)
2. **`InterestDeclaration`** + 6 child tables — Registro de Intereses Económicos
3. **`BureauMember` → `OrganMember`** rename with `organType` field

No Prisma migrations will be generated. Schema changes are applied via `db:push`
(dev environment only; no production data exists yet).

---

## 1. Initiative

Maps to the congreso.es Iniciativas open data dataset.

### Fields

| Field            | Type     | Nullable | Notes                                         |
| ---------------- | -------- | -------- | --------------------------------------------- |
| `id`             | String   | No       | cuid() PK                                     |
| `legislature`    | Int      | No       | Legislature number (e.g. 15)                  |
| `tipo`           | String   | No       | e.g. "Proyecto de Ley", "Real Decreto-ley"    |
| `number`         | String   | Yes      | NUMERO_LEY — null for non-enacted initiatives |
| `title`          | String   | No       | TITULO_LEY                                    |
| `bulletinNumber` | String   | Yes      | NUMERO_BOLETIN — BOE reference                |
| `bulletinDate`   | DateTime | Yes      | FECHA_BOLETIN                                 |
| `enactedDate`    | DateTime | Yes      | FECHA_LEY — null if not enacted               |
| `pdfUrl`         | String   | Yes      | Link to official PDF                          |
| `createdAt`      | DateTime | No       | Default now()                                 |
| `updatedAt`      | DateTime | No       | @updatedAt                                    |

### Natural Key

`@@unique([legislature, bulletinNumber])` — bulletin number is the most stable
identifier. Non-enacted initiatives without a bulletin number are edge cases
(they won't have a NUMERO_LEY either); accepted as a known limitation.

---

## 2. InterestDeclaration + Child Tables

Maps to the congreso.es Registro de Intereses open data (structured XML/JSON).
Each declaration is filed annually per deputy. Asset categories are fully
normalized into child tables for queryability.

### Parent: InterestDeclaration

| Field       | Type     | Nullable | Notes            |
| ----------- | -------- | -------- | ---------------- |
| `id`        | String   | No       | cuid() PK        |
| `deputyId`  | String   | No       | FK → Deputy      |
| `year`      | Int      | No       | Declaration year |
| `pdfUrl`    | String   | Yes      | Link to full PDF |
| `createdAt` | DateTime | No       | Default now()    |
| `updatedAt` | DateTime | No       | @updatedAt       |

Natural key: `@@unique([deputyId, year])`

### Child: RealEstateAsset (Bienes inmuebles)

| Field              | Type     | Nullable | Notes                            |
| ------------------ | -------- | -------- | -------------------------------- |
| `id`               | String   | No       | cuid() PK                        |
| `declarationId`    | String   | No       | FK → InterestDeclaration         |
| `propertyType`     | String   | No       | e.g. "Vivienda", "Garaje"        |
| `address`          | String   | Yes      | Street address (may be redacted) |
| `surface`          | Float    | Yes      | m²                               |
| `acquisitionYear`  | Int      | Yes      |                                  |
| `acquisitionValue` | Float    | Yes      | EUR at acquisition               |
| `currentValue`     | Float    | Yes      | EUR current cadastral/market     |
| `mortgage`         | Float    | Yes      | Outstanding mortgage EUR         |
| `createdAt`        | DateTime | No       |                                  |
| `updatedAt`        | DateTime | No       |                                  |

### Child: MovableAsset (Bienes muebles)

| Field             | Type     | Nullable | Notes                          |
| ----------------- | -------- | -------- | ------------------------------ |
| `id`              | String   | No       | cuid() PK                      |
| `declarationId`   | String   | No       | FK → InterestDeclaration       |
| `assetType`       | String   | No       | e.g. "Vehículo", "Embarcación" |
| `description`     | String   | Yes      | Make/model or description      |
| `acquisitionYear` | Int      | Yes      |                                |
| `value`           | Float    | Yes      | EUR                            |
| `createdAt`       | DateTime | No       |                                |
| `updatedAt`       | DateTime | No       |                                |

### Child: Security (Valores mobiliarios)

| Field             | Type     | Nullable | Notes                     |
| ----------------- | -------- | -------- | ------------------------- |
| `id`              | String   | No       | cuid() PK                 |
| `declarationId`   | String   | No       | FK → InterestDeclaration  |
| `issuer`          | String   | No       | Company/fund name         |
| `securityType`    | String   | No       | e.g. "Acciones", "Fondos" |
| `acquisitionYear` | Int      | Yes      |                           |
| `nominalValue`    | Float    | Yes      | EUR                       |
| `marketValue`     | Float    | Yes      | EUR                       |
| `createdAt`       | DateTime | No       |                           |
| `updatedAt`       | DateTime | No       |                           |

### Child: BankAccount (Cuentas bancarias)

| Field           | Type     | Nullable | Notes                                                |
| --------------- | -------- | -------- | ---------------------------------------------------- |
| `id`            | String   | No       | cuid() PK                                            |
| `declarationId` | String   | No       | FK → InterestDeclaration                             |
| `institution`   | String   | No       | Bank name                                            |
| `accountType`   | String   | No       | e.g. "Corriente", "Ahorro"                           |
| `balanceRange`  | String   | Yes      | Range string (source uses ranges, not exact amounts) |
| `createdAt`     | DateTime | No       |                                                      |
| `updatedAt`     | DateTime | No       |                                                      |

### Child: ProfessionalActivity (Actividades)

| Field           | Type     | Nullable | Notes                    |
| --------------- | -------- | -------- | ------------------------ |
| `id`            | String   | No       | cuid() PK                |
| `declarationId` | String   | No       | FK → InterestDeclaration |
| `entity`        | String   | No       | Organisation name        |
| `position`      | String   | No       | Role/title               |
| `startDate`     | DateTime | Yes      |                          |
| `endDate`       | DateTime | Yes      | Null if currently active |
| `remunerated`   | Boolean  | No       | Whether position is paid |
| `createdAt`     | DateTime | No       |                          |
| `updatedAt`     | DateTime | No       |                          |

### Child: IncomeSource (Fuentes de ingresos)

| Field           | Type     | Nullable | Notes                                |
| --------------- | -------- | -------- | ------------------------------------ |
| `id`            | String   | No       | cuid() PK                            |
| `declarationId` | String   | No       | FK → InterestDeclaration             |
| `source`        | String   | No       | Organisation or person paying income |
| `concept`       | String   | No       | Nature of income                     |
| `amountRange`   | String   | Yes      | Range string (source uses ranges)    |
| `createdAt`     | DateTime | No       |                                      |
| `updatedAt`     | DateTime | No       |                                      |

---

## 3. BureauMember → OrganMember

The existing `BureauMember` model is renamed to `OrganMember`. The bureau
scraper already fetches all congressional organs (Mesa, Comisiones, Junta de
Portavoces, etc.) via the `/opendata/organos` endpoint — the current name is
misleading.

### Changes

- Model renamed: `BureauMember` → `OrganMember`
- New field: `organType String` — discriminator for the organ type:
  - `MESA` — Mesa del Congreso
  - `COMISION` — Parliamentary committee
  - `JUNTA_PORTAVOCES` — Speakers' conference
  - `DIPUTACION_PERMANENTE` — Standing committee
  - `OTHER` — Any other organ
- All other fields unchanged.
- Natural key `@@unique([name, organ, position, startDate])` unchanged.

### Downstream changes

| Location                                        | Change                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `schema.prisma`                                 | Rename model, add `organType` field                                              |
| `packages/database/src/repositories/bureaus.ts` | Rename to `organMembers.ts`; update `prisma.bureauMember` → `prisma.organMember` |
| `packages/database/src/index.ts`                | Update re-exports                                                                |
| `apps/api/src/routes/bureaus.ts`                | Rename to `organs.ts`; update route prefix `/bureaus` → `/organs`                |
| `apps/api/src/app.ts`                           | Update import and registration call                                              |

---

## Scope Summary

| Area                     | Work items                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `schema.prisma`          | +8 new models, rename 1 model, +1 field on renamed model                                          |
| Database                 | `db:push` only (no migration files)                                                               |
| Repositories             | +2 new (`initiatives.ts`, `interestDeclarations.ts`), rename 1 (`bureaus.ts` → `organMembers.ts`) |
| API routes               | +2 new (`/initiatives`, `/interest-declarations`), rename 1 (`/bureaus` → `/organs`)              |
| Database package exports | Update `index.ts`                                                                                 |
| API app registration     | Update `app.ts`                                                                                   |

/*
  Warnings:

  - You are about to drop the column `tipo` on the `Initiative` table. All the data in the column will be lost.
  - Added the required column `type` to the `Initiative` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Initiative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legislature" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expedienteNumero" TEXT,
    "bulletinNumber" TEXT,
    "bulletinDate" DATETIME,
    "number" TEXT,
    "enactedDate" DATETIME,
    "pdfUrl" TEXT,
    "situacion" TEXT,
    "resultadoTramitacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Initiative" ("bulletinDate", "bulletinNumber", "createdAt", "enactedDate", "expedienteNumero", "id", "legislature", "number", "pdfUrl", "resultadoTramitacion", "situacion", "title", "updatedAt") SELECT "bulletinDate", "bulletinNumber", "createdAt", "enactedDate", "expedienteNumero", "id", "legislature", "number", "pdfUrl", "resultadoTramitacion", "situacion", "title", "updatedAt" FROM "Initiative";
DROP TABLE "Initiative";
ALTER TABLE "new_Initiative" RENAME TO "Initiative";
CREATE UNIQUE INDEX "Initiative_legislature_expedienteNumero_key" ON "Initiative"("legislature", "expedienteNumero");
CREATE UNIQUE INDEX "Initiative_legislature_bulletinNumber_key" ON "Initiative"("legislature", "bulletinNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

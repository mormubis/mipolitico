/*
  Warnings:

  - Made the column `name` on table `Party` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Party_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Party" ("createdAt", "id", "name", "parentId", "shortName", "updatedAt") SELECT "createdAt", "id", "name", "parentId", "shortName", "updatedAt" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE UNIQUE INDEX "Party_shortName_key" ON "Party"("shortName");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

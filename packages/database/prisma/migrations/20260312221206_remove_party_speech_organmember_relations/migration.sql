/*
  Warnings:

  - You are about to drop the column `partyId` on the `OrganMember` table. All the data in the column will be lost.
  - You are about to drop the column `partyId` on the `Speech` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrganMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "organ" TEXT NOT NULL,
    "organType" TEXT NOT NULL DEFAULT 'OTHER',
    "partyGroup" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrganMember" ("createdAt", "endDate", "id", "name", "organ", "organType", "partyGroup", "personId", "position", "startDate", "updatedAt") SELECT "createdAt", "endDate", "id", "name", "organ", "organType", "partyGroup", "personId", "position", "startDate", "updatedAt" FROM "OrganMember";
DROP TABLE "OrganMember";
ALTER TABLE "new_OrganMember" RENAME TO "OrganMember";
CREATE UNIQUE INDEX "OrganMember_name_organ_position_startDate_key" ON "OrganMember"("name", "organ", "position", "startDate");
CREATE TABLE "new_Speech" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "sessionId" TEXT NOT NULL,
    "sessionDate" DATETIME NOT NULL,
    "sessionTitle" TEXT NOT NULL,
    "sessionUrl" TEXT NOT NULL,
    "speakerRaw" TEXT NOT NULL,
    "speakerName" TEXT NOT NULL,
    "speakerRole" TEXT,
    "text" TEXT NOT NULL,
    "orderInSession" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Speech_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Speech" ("createdAt", "id", "orderInSession", "personId", "sessionDate", "sessionId", "sessionTitle", "sessionUrl", "speakerName", "speakerRaw", "speakerRole", "text", "updatedAt") SELECT "createdAt", "id", "orderInSession", "personId", "sessionDate", "sessionId", "sessionTitle", "sessionUrl", "speakerName", "speakerRaw", "speakerRole", "text", "updatedAt" FROM "Speech";
DROP TABLE "Speech";
ALTER TABLE "new_Speech" RENAME TO "Speech";
CREATE UNIQUE INDEX "Speech_sessionId_orderInSession_key" ON "Speech"("sessionId", "orderInSession");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

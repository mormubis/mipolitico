-- CreateTable
CREATE TABLE "GovernmentMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "legislature" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GovernmentMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Intervention" (
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
    "organ" TEXT,
    "initiativeSubject" TEXT,
    "interventionType" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "videoUrl" TEXT,
    "videoDownloadUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "governmentMemberId" TEXT,
    CONSTRAINT "Intervention_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Intervention_governmentMemberId_fkey" FOREIGN KEY ("governmentMemberId") REFERENCES "GovernmentMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Intervention" ("createdAt", "endTime", "id", "initiativeSubject", "interventionType", "orderInSession", "organ", "personId", "sessionDate", "sessionId", "sessionTitle", "sessionUrl", "speakerName", "speakerRaw", "speakerRole", "startTime", "text", "updatedAt", "videoDownloadUrl", "videoUrl") SELECT "createdAt", "endTime", "id", "initiativeSubject", "interventionType", "orderInSession", "organ", "personId", "sessionDate", "sessionId", "sessionTitle", "sessionUrl", "speakerName", "speakerRaw", "speakerRole", "startTime", "text", "updatedAt", "videoDownloadUrl", "videoUrl" FROM "Intervention";
DROP TABLE "Intervention";
ALTER TABLE "new_Intervention" RENAME TO "Intervention";
CREATE UNIQUE INDEX "Intervention_sessionId_orderInSession_key" ON "Intervention"("sessionId", "orderInSession");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GovernmentMember_personId_role_legislature_key" ON "GovernmentMember"("personId", "role", "legislature");

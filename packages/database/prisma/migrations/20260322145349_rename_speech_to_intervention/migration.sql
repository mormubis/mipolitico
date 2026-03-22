/*
  Warnings:

  - You are about to drop the `Speech` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Speech";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Intervention" (
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
    CONSTRAINT "Intervention_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Intervention_sessionId_orderInSession_key" ON "Intervention"("sessionId", "orderInSession");

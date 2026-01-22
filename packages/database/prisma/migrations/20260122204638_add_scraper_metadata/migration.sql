-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "biography" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Deputy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "partyId" TEXT,
    "constituency" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "fullConditionDate" DATETIME,
    "parliamentaryGroup" TEXT NOT NULL,
    "electoralFormation" TEXT NOT NULL,
    "legislature" INTEGER NOT NULL DEFAULT 15,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deputy_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Deputy_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VotingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legislature" INTEGER NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "votingNumber" INTEGER NOT NULL,
    "votingDate" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "byAssent" BOOLEAN NOT NULL DEFAULT false,
    "totalPresent" INTEGER NOT NULL,
    "totalFor" INTEGER NOT NULL,
    "totalAgainst" INTEGER NOT NULL,
    "totalAbstention" INTEGER NOT NULL,
    "totalNoVote" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "deputySeat" TEXT NOT NULL,
    "deputyName" TEXT NOT NULL,
    "deputyGroup" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VotingSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Speech" (
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

-- CreateTable
CREATE TABLE "BureauMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "organ" TEXT NOT NULL,
    "partyGroup" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BureauMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScraperMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scraperType" TEXT NOT NULL,
    "lastSuccessfulRun" DATETIME,
    "lastAttemptedRun" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Party_name_key" ON "Party"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Deputy_personId_legislature_startDate_key" ON "Deputy"("personId", "legislature", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "VotingSession_legislature_sessionNumber_votingNumber_key" ON "VotingSession"("legislature", "sessionNumber", "votingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_sessionId_deputySeat_key" ON "Vote"("sessionId", "deputySeat");

-- CreateIndex
CREATE UNIQUE INDEX "Speech_sessionId_orderInSession_key" ON "Speech"("sessionId", "orderInSession");

-- CreateIndex
CREATE UNIQUE INDEX "BureauMember_name_organ_position_startDate_key" ON "BureauMember"("name", "organ", "position", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperMetadata_scraperType_key" ON "ScraperMetadata"("scraperType");

-- CreateIndex
CREATE INDEX "ScraperMetadata_scraperType_idx" ON "ScraperMetadata"("scraperType");

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "benefactor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Donation_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "InterestDeclaration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Foundation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Foundation_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "InterestDeclaration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "declarationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Observation_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "InterestDeclaration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

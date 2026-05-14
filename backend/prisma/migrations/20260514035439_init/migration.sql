-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "birthDate" DATETIME,
    "deathDate" DATETIME,
    "biography" TEXT,
    "occupation" TEXT,
    "burialPlace" TEXT,
    "notes" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "branchId" TEXT,
    "fatherId" TEXT,
    "motherId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_fatherId_fkey" FOREIGN KEY ("fatherId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Person_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Marriage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "husbandId" TEXT NOT NULL,
    "wifeId" TEXT NOT NULL,
    "marriageDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Marriage_husbandId_fkey" FOREIGN KEY ("husbandId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Marriage_wifeId_fkey" FOREIGN KEY ("wifeId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE INDEX "Person_generation_idx" ON "Person"("generation");

-- CreateIndex
CREATE INDEX "Person_branchId_idx" ON "Person"("branchId");

-- CreateIndex
CREATE INDEX "Person_fatherId_idx" ON "Person"("fatherId");

-- CreateIndex
CREATE INDEX "Person_motherId_idx" ON "Person"("motherId");

-- CreateIndex
CREATE INDEX "Marriage_husbandId_idx" ON "Marriage"("husbandId");

-- CreateIndex
CREATE INDEX "Marriage_wifeId_idx" ON "Marriage"("wifeId");

-- CreateIndex
CREATE UNIQUE INDEX "Marriage_husbandId_wifeId_key" ON "Marriage"("husbandId", "wifeId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE INDEX "Media_personId_idx" ON "Media"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

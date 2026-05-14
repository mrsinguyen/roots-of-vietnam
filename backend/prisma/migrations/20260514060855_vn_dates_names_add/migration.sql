-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL DEFAULT '',
    "honorific" TEXT,
    "gender" TEXT NOT NULL,
    "birthYear" INTEGER,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "deathYear" INTEGER,
    "deathMonth" INTEGER,
    "deathDay" INTEGER,
    "birthDateLunar" TEXT,
    "deathDateLunar" TEXT,
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
INSERT INTO "new_Person" ("biography", "birthDate", "branchId", "burialPlace", "createdAt", "deathDate", "fatherId", "fullName", "gender", "generation", "id", "motherId", "notes", "occupation", "updatedAt") SELECT "biography", "birthDate", "branchId", "burialPlace", "createdAt", "deathDate", "fatherId", "fullName", "gender", "generation", "id", "motherId", "notes", "occupation", "updatedAt" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");
CREATE INDEX "Person_nameNormalized_idx" ON "Person"("nameNormalized");
CREATE INDEX "Person_generation_idx" ON "Person"("generation");
CREATE INDEX "Person_branchId_idx" ON "Person"("branchId");
CREATE INDEX "Person_fatherId_idx" ON "Person"("fatherId");
CREATE INDEX "Person_motherId_idx" ON "Person"("motherId");
CREATE INDEX "Person_birthYear_idx" ON "Person"("birthYear");

-- Data backfill: split legacy DateTime columns into year/month/day triplets
-- and seed nameNormalized so search keeps working without the application layer.
UPDATE "Person"
SET
  "birthYear"  = CASE WHEN "birthDate" IS NULL THEN NULL ELSE CAST(strftime('%Y', "birthDate") AS INTEGER) END,
  "birthMonth" = CASE WHEN "birthDate" IS NULL THEN NULL ELSE CAST(strftime('%m', "birthDate") AS INTEGER) END,
  "birthDay"   = CASE WHEN "birthDate" IS NULL THEN NULL ELSE CAST(strftime('%d', "birthDate") AS INTEGER) END,
  "deathYear"  = CASE WHEN "deathDate" IS NULL THEN NULL ELSE CAST(strftime('%Y', "deathDate") AS INTEGER) END,
  "deathMonth" = CASE WHEN "deathDate" IS NULL THEN NULL ELSE CAST(strftime('%m', "deathDate") AS INTEGER) END,
  "deathDay"   = CASE WHEN "deathDate" IS NULL THEN NULL ELSE CAST(strftime('%d', "deathDate") AS INTEGER) END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

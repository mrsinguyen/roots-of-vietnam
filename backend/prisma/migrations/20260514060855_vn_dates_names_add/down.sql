-- Rollback for 20260514060855_vn_dates_names_add.
-- Removes the new columns and indexes, restoring the prior Person table shape.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "Person_nameNormalized_idx";
DROP INDEX IF EXISTS "Person_birthYear_idx";

CREATE TABLE "rollback_Person" (
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
INSERT INTO "rollback_Person" ("id","fullName","gender","birthDate","deathDate","biography","occupation","burialPlace","notes","generation","branchId","fatherId","motherId","createdAt","updatedAt")
SELECT "id","fullName","gender","birthDate","deathDate","biography","occupation","burialPlace","notes","generation","branchId","fatherId","motherId","createdAt","updatedAt" FROM "Person";

DROP TABLE "Person";
ALTER TABLE "rollback_Person" RENAME TO "Person";

CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");
CREATE INDEX "Person_generation_idx" ON "Person"("generation");
CREATE INDEX "Person_branchId_idx" ON "Person"("branchId");
CREATE INDEX "Person_fatherId_idx" ON "Person"("fatherId");
CREATE INDEX "Person_motherId_idx" ON "Person"("motherId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Rollback for 20260514061800_vn_dates_drop_legacy.
-- Restores the transitional birthDate/deathDate DateTime columns. Values are
-- reconstructed from the year/month/day triplets where present (day/month
-- default to 1 if unknown).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

ALTER TABLE "Person" ADD COLUMN "birthDate" DATETIME;
ALTER TABLE "Person" ADD COLUMN "deathDate" DATETIME;

UPDATE "Person"
SET "birthDate" = CASE
  WHEN "birthYear" IS NULL THEN NULL
  ELSE printf('%04d-%02d-%02d 00:00:00', "birthYear", COALESCE("birthMonth", 1), COALESCE("birthDay", 1))
END,
"deathDate" = CASE
  WHEN "deathYear" IS NULL THEN NULL
  ELSE printf('%04d-%02d-%02d 00:00:00', "deathYear", COALESCE("deathMonth", 1), COALESCE("deathDay", 1))
END;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

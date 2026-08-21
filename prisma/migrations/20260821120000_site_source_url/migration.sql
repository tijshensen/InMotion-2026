-- AlterTable
ALTER TABLE "Site" ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT '';

-- Backfill from clone/inspired import settings
UPDATE "Site"
SET "sourceUrl" = (
  SELECT "value" FROM "SiteSetting"
  WHERE "SiteSetting"."siteId" = "Site"."id"
    AND "SiteSetting"."key" = 'importedFromUrl'
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM "SiteSetting"
  WHERE "SiteSetting"."siteId" = "Site"."id"
    AND "SiteSetting"."key" = 'importedFromUrl'
    AND TRIM("SiteSetting"."value") != ''
);

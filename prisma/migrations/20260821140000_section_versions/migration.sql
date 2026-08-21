-- AlterTable
ALTER TABLE "PageBlock" ADD COLUMN "js" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PageBlockVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageBlockId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'grok',
    "prompt" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "layoutHtml" TEXT NOT NULL DEFAULT '',
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "fieldsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageBlockVersion_pageBlockId_fkey" FOREIGN KEY ("pageBlockId") REFERENCES "PageBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PageBlockVersion_pageBlockId_createdAt_idx" ON "PageBlockVersion"("pageBlockId", "createdAt");

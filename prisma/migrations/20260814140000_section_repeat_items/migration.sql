-- CreateTable
CREATE TABLE "PageBlockRepeatItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageBlockId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL DEFAULT 'items',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'added',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PageBlockRepeatItem_pageBlockId_fkey" FOREIGN KEY ("pageBlockId") REFERENCES "PageBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PageBlockRepeatItem_pageBlockId_groupKey_sortOrder_idx" ON "PageBlockRepeatItem"("pageBlockId", "groupKey", "sortOrder");

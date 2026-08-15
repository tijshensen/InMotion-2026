-- CreateTable
CREATE TABLE "GrokImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "raw" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrokImport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GrokImport_siteId_createdAt_idx" ON "GrokImport"("siteId", "createdAt");

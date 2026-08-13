/**
 * Generate missing section-layout thumbnails (background, one at a time).
 *   npx tsx scripts/backfill-section-previews.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  closePreviewBrowser,
  generateSectionPreview,
} from "../src/lib/section-preview";

const prisma = new PrismaClient();

async function main() {
  const blocks = await prisma.templateBlock.findMany({
    where: { defaultHtml: { not: "" } },
    select: { id: true, name: true, previewPath: true },
    orderBy: { name: "asc" },
  });
  console.log(`Generating previews for ${blocks.length} section(s)…`);
  let ok = 0;
  let fail = 0;
  for (const b of blocks) {
    try {
      const path = await generateSectionPreview(b.id);
      console.log(path ? `ok  ${b.name} → ${path}` : `skip ${b.name}`);
      if (path) ok++;
    } catch (e) {
      fail++;
      console.error(`fail ${b.name}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`Done. ${ok} saved, ${fail} failed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await closePreviewBrowser();
    await prisma.$disconnect();
  });

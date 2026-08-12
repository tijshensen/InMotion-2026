/**
 * Repair template_block.defaultHtml and page content field values
 * corrupted by legacy SQL import (literal "n"/"r" instead of newlines).
 *
 *   npx tsx scripts/fix-section-html.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeInsertHtml } from "../src/lib/insert-html";

const prisma = new PrismaClient();

async function main() {
  const blocks = await prisma.templateBlock.findMany();
  let fixedBlocks = 0;
  for (const b of blocks) {
    const next = normalizeInsertHtml(b.defaultHtml);
    if (next !== b.defaultHtml) {
      await prisma.templateBlock.update({
        where: { id: b.id },
        data: { defaultHtml: next },
      });
      fixedBlocks++;
    }
  }
  console.log(`Fixed ${fixedBlocks} / ${blocks.length} template blocks`);

  // Also clean field values that still contain XML wrappers
  const pageBlocks = await prisma.pageBlock.findMany();
  let fixedContent = 0;
  for (const pb of pageBlocks) {
    let content = pb.content;
    if (!content) continue;
    try {
      const data = JSON.parse(content);
      if (!data?.fields || typeof data.fields !== "object") continue;
      let changed = false;
      for (const [k, v] of Object.entries(data.fields)) {
        if (typeof v !== "string") continue;
        let next = v
          .replace(/<\?xml[^?]*\?>\s*/gi, "")
          .replace(/^<\/?(?:singleline|multiline|file)[^>]*>/i, "")
          .replace(/<\/(?:singleline|multiline|file)>\s*$/i, "");
        // Only normalize if it looks like HTML structure with r/n artifacts
        if (/[>]\s*[rn]\s*[<\t]/.test(next) || /^[rn]\s*</.test(next)) {
          next = normalizeInsertHtml(next);
        }
        if (next !== v) {
          data.fields[k] = next;
          changed = true;
        }
      }
      if (changed) {
        await prisma.pageBlock.update({
          where: { id: pb.id },
          data: { content: JSON.stringify(data) },
        });
        fixedContent++;
      }
    } catch {
      /* skip non-json */
    }
  }
  console.log(`Fixed content on ${fixedContent} / ${pageBlocks.length} page blocks`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

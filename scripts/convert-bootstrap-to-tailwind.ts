/**
 * Convert Bootstrap classes in stored CMS HTML to Tailwind.
 *
 *   npx tsx scripts/convert-bootstrap-to-tailwind.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  convertBootstrapHtml,
  TAILWIND_SHELL,
} from "../src/lib/bootstrap-to-tailwind";
import { normalizeInsertHtml } from "../src/lib/insert-html";

const prisma = new PrismaClient();

async function main() {
  let nTemplates = 0;
  let nBlocks = 0;
  let nInserts = 0;
  let nPageBlocks = 0;

  const templates = await prisma.template.findMany();
  for (const t of templates) {
    const next = TAILWIND_SHELL;
    // Always move shells off Bootstrap CDN onto Tailwind shell
    if (t.coreHtml !== next) {
      await prisma.template.update({
        where: { id: t.id },
        data: { coreHtml: next },
      });
      nTemplates++;
    }
  }
  console.log(`Templates updated: ${nTemplates}/${templates.length}`);

  const blocks = await prisma.templateBlock.findMany();
  for (const b of blocks) {
    const normalized = normalizeInsertHtml(b.defaultHtml);
    const next = convertBootstrapHtml(normalized);
    if (next !== b.defaultHtml) {
      await prisma.templateBlock.update({
        where: { id: b.id },
        data: { defaultHtml: next },
      });
      nBlocks++;
    }
  }
  console.log(`Template blocks updated: ${nBlocks}/${blocks.length}`);

  const inserts = await prisma.insert.findMany();
  for (const ins of inserts) {
    const normalized = normalizeInsertHtml(ins.content);
    const next = convertBootstrapHtml(normalized);
    if (next !== ins.content) {
      await prisma.insert.update({
        where: { id: ins.id },
        data: { content: next },
      });
      nInserts++;
    }
  }
  console.log(`Inserts updated: ${nInserts}/${inserts.length}`);

  // Multiline field HTML inside page blocks may also contain BS classes
  const pageBlocks = await prisma.pageBlock.findMany();
  for (const pb of pageBlocks) {
    if (!pb.content?.trim()) continue;
    try {
      const data = JSON.parse(pb.content);
      if (!data?.fields || typeof data.fields !== "object") continue;
      let changed = false;
      for (const [k, v] of Object.entries(data.fields)) {
        if (typeof v !== "string") continue;
        if (!/class\s*=|col-md|col-sm|form-control|btn |container|img-responsive/.test(v)) {
          continue;
        }
        const next = convertBootstrapHtml(v);
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
        nPageBlocks++;
      }
    } catch {
      /* skip */
    }
  }
  console.log(`Page block contents updated: ${nPageBlocks}/${pageBlocks.length}`);

  // Spot-check
  const sample = await prisma.templateBlock.findFirst({
    where: { name: "3 kolomen" },
  });
  console.log("\nSample (3 kolomen):\n", sample?.defaultHtml?.slice(0, 500));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

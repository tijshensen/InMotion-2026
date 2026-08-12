/**
 * One-shot: repair all insert HTML in the database (n/r artifacts).
 *   npx tsx scripts/fix-inserts-html.ts
 */
import { PrismaClient } from "@prisma/client";
import { formatInsertHtml } from "../src/lib/insert-html";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.insert.findMany();
  let fixed = 0;
  for (const row of rows) {
    const next = formatInsertHtml(row.content);
    if (next !== row.content) {
      await prisma.insert.update({
        where: { id: row.id },
        data: { content: next },
      });
      fixed++;
      console.log("fixed", row.tag);
    }
  }
  console.log(`\nDone: ${fixed}/${rows.length} inserts updated`);

  const sample = await prisma.insert.findFirst({
    where: { tag: { contains: "FOOTER" } },
  });
  if (sample) {
    console.log("\n--- [FOOTER] sample ---");
    console.log(sample.content.slice(0, 400));
  }
  const table = await prisma.insert.findFirst({
    where: { tag: { contains: "BSOALLEENINVAKANTIES" } },
  });
  if (table) {
    console.log("\n--- [BSOALLEENINVAKANTIES] sample ---");
    console.log(table.content.slice(0, 400));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

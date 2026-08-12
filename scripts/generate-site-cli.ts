/**
 * CLI: generate static site for a slug
 *   npx tsx scripts/generate-site-cli.ts kiekeboe
 */
import { PrismaClient } from "@prisma/client";
import { generateStaticSite } from "../src/lib/generate-site";

const slug = process.argv[2] || "kiekeboe";
const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) throw new Error(`Site not found: ${slug}`);
  const result = await generateStaticSite(site.id);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

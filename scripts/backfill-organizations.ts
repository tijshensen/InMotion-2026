/**
 * Attach existing sites to the Default organization and ensure
 * SUPERADMIN users are org owners. Run after schema migrate:
 *   npx tsx scripts/backfill-organizations.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  let org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Default organization", slug: "default" },
    });
    console.log("Created organization", org.slug);
  }

  const superadmins = await prisma.user.findMany({
    where: { role: "SUPERADMIN" },
  });
  for (const u of superadmins) {
    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: u.id,
        },
      },
      create: {
        organizationId: org.id,
        userId: u.id,
        role: "OWNER",
      },
      update: { role: "OWNER" },
    });
    console.log("Owner:", u.email);
  }

  const orphanSites = await prisma.site.findMany({
    where: { organizationId: null },
  });
  for (const s of orphanSites) {
    await prisma.site.update({
      where: { id: s.id },
      data: { organizationId: org.id },
    });
    console.log("Attached site", s.slug, "→", org.slug);
  }

  // Ensure each superadmin has a site membership on attached sites
  const sites = await prisma.site.findMany({
    where: { organizationId: org.id },
  });
  for (const u of superadmins) {
    for (const s of sites) {
      await prisma.siteMember.upsert({
        where: {
          siteId_userId: { siteId: s.id, userId: u.id },
        },
        create: { siteId: s.id, userId: u.id, role: "ADMIN" },
        update: {},
      });
    }
  }

  console.log("Done. Sites:", sites.length, "Owners:", superadmins.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

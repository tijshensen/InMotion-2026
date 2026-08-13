/**
 * First-boot admin. No-op once any user exists.
 * Set ADMIN_EMAIL / ADMIN_PASSWORD in Railway, or a random password is printed once.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("[start] Users already exist; skipping bootstrap admin.");
    return;
  }

  const email = (process.env.ADMIN_EMAIL || "admin@cmsinmotion.local").trim().toLowerCase();
  const provided = Boolean(process.env.ADMIN_PASSWORD);
  const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: "SUPERADMIN",
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "Default organization", slug: "default" },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });

  console.log(`[start] Created SUPERADMIN ${email}`);
  if (!provided) {
    console.log(`[start] Temporary password: ${password}`);
    console.log("[start] Change this immediately. Set ADMIN_PASSWORD to choose your own on first boot.");
  }
}

main()
  .catch((err) => {
    console.error("[start] ensure-admin failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

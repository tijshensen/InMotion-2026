import { prisma } from "./db";
import { slugifySite } from "./sites";
import { hashPassword } from "./auth";

export async function ensurePersonalOrg(userId: string, email: string) {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId, role: "OWNER", organization: { isActive: true } },
    include: { organization: true },
    orderBy: { organization: { createdAt: "asc" } },
  });
  if (existing?.organization) return existing.organization;

  const local = email.split("@")[0] || "workspace";
  let slug = slugifySite(local) || "workspace";
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugifySite(local) || "workspace"}-${n}`;
  }

  return prisma.organization.create({
    data: {
      name: `${local}'s workspace`,
      slug,
      members: {
        create: { userId, role: "OWNER" },
      },
    },
  });
}

export async function upsertGoogleUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const email = opts.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.isActive) {
      throw new Error("This account is disabled");
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      firstName: opts.firstName.trim() || "There",
      lastName: opts.lastName.trim(),
      passwordHash: await hashPassword(`oauth-google:${crypto.randomUUID()}`),
      role: "EDITOR",
    },
  });
}

export async function userHasAnySite(userId: string) {
  const count = await prisma.siteMember.count({ where: { userId } });
  return count > 0;
}

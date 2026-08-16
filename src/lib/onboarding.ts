import { prisma } from "./db";
import { slugifySite } from "./sites";
import { hashPassword } from "./auth";

const REPLAY_SEEDED_KEY = "onboarding_replay_seeded";

/** Emails that get “always open onboarding” turned on once (they can turn it off). */
export const DEFAULT_ONBOARDING_REPLAY_EMAILS = ["tijs@websales360.com"];

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
      replayOnboarding: DEFAULT_ONBOARDING_REPLAY_EMAILS.includes(email),
    },
  });
}

export async function seedOnboardingReplayOnce() {
  const done = await prisma.appSetting.findUnique({
    where: { key: REPLAY_SEEDED_KEY },
  });
  if (done) return;
  await prisma.user.updateMany({
    where: { email: { in: DEFAULT_ONBOARDING_REPLAY_EMAILS } },
    data: { replayOnboarding: true },
  });
  await prisma.appSetting.create({
    data: { key: REPLAY_SEEDED_KEY, value: "1" },
  });
}

export async function userHasAnySite(userId: string) {
  const count = await prisma.siteMember.count({ where: { userId } });
  return count > 0;
}

export async function postLoginPath(user: {
  id: string;
  replayOnboarding: boolean;
}) {
  if (user.replayOnboarding) return "/onboarding";
  return (await userHasAnySite(user.id)) ? "/admin" : "/onboarding";
}

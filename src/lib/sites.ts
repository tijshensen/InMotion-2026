/**
 * Create a new website under an organization (client owner / superadmin).
 */

import { prisma } from "./db";
import type { Role } from "@prisma/client";

export function slugifySite(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createSiteForOrg(opts: {
  organizationId: string;
  name: string;
  slug?: string;
  domain?: string | null;
  siteTitle?: string;
  cssFramework?: string;
  sourceUrl?: string;
  themeSlug?: string;
  creatorUserId: string;
  /** Site role for the creator (default ADMIN). Superadmin still gets membership. */
  creatorSiteRole?: Role;
}) {
  const baseSlug = slugifySite(opts.slug || opts.name);
  if (!baseSlug) throw new Error("Invalid site slug");

  let slug = baseSlug;
  let n = 0;
  while (await prisma.site.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${baseSlug}-${n}`;
  }

  const org = await prisma.organization.findUnique({
    where: { id: opts.organizationId },
  });
  if (!org || !org.isActive) throw new Error("Organization not found");

  const site = await prisma.site.create({
    data: {
      name: opts.name.trim(),
      slug,
      domain: opts.domain?.trim() || null,
      siteTitle: (opts.siteTitle || opts.name).trim(),
      cssFramework: opts.cssFramework || "none",
      sourceUrl: (opts.sourceUrl || "").trim(),
      themeSlug: opts.themeSlug?.trim() || slug,
      organizationId: opts.organizationId,
      languages: {
        create: {
          name: "Nederlands",
          code: "nl",
          isDefault: true,
          siteTitle: (opts.siteTitle || opts.name).trim(),
        },
      },
      members: {
        create: {
          userId: opts.creatorUserId,
          role: opts.creatorSiteRole || "ADMIN",
        },
      },
      settings: {
        create: [
          { key: "multiLanguage", value: "0" },
          { key: "theme", value: "default" },
        ],
      },
    },
    include: {
      languages: true,
      organization: true,
      members: true,
    },
  });

  return site;
}

export async function ensureDefaultOrganization() {
  let org = await prisma.organization.findFirst({
    where: { slug: "default" },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Default organization",
        slug: "default",
      },
    });
  }
  return org;
}

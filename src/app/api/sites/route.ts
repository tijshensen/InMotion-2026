import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import {
  assertCanCreateSite,
  canCreateAnySite,
  listAccessibleSites,
  listOwnedOrganizations,
} from "@/lib/access";
import { createSiteForOrg } from "@/lib/sites";
import { setActiveSiteId } from "@/lib/site-context";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sites = await listAccessibleSites(user.id);
  const canCreate = await canCreateAnySite(user.id);
  const orgs = canCreate ? await listOwnedOrganizations(user.id) : [];

  return NextResponse.json({
    sites,
    canCreate,
    organizations: orgs,
  });
}

const createSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1).max(120),
  slug: z.string().max(48).optional(),
  domain: z.string().max(200).optional().nullable(),
  siteTitle: z.string().max(200).optional(),
  cssFramework: z
    .enum(["bootstrap", "tailwind", "none", "custom"])
    .optional(),
  themeSlug: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await req.json());
    const denied = await assertCanCreateSite(user, body.organizationId);
    if (denied) return denied;

    const site = await createSiteForOrg({
      organizationId: body.organizationId,
      name: body.name,
      slug: body.slug,
      domain: body.domain,
      siteTitle: body.siteTitle,
      cssFramework: body.cssFramework,
      themeSlug: body.themeSlug,
      creatorUserId: user.id,
    });

    await setActiveSiteId(site.id);

    return NextResponse.json(site, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : "Could not create site";
    console.error("[sites] create", e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

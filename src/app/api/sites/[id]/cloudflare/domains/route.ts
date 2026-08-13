import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  addPagesDomain,
  cloudflareConfigured,
  dnsHintForDomain,
  isValidHostname,
  listPagesDomains,
  normalizeHostname,
  pagesHostForSite,
} from "@/lib/cloudflare-pages";
import { transipConfigured } from "@/lib/transip";
import { getDnsInstructions } from "@/lib/dns-instructions";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pagesHost = pagesHostForSite(site);
  let domains: { name: string; status: string }[] = [];
  if (cloudflareConfigured()) {
    try {
      domains = await listPagesDomains(site.cloudflareProject || site.slug);
    } catch (e) {
      return NextResponse.json({
        pagesHost,
        domain: site.domain,
        domains,
        hasTransip: transipConfigured(),
        error: e instanceof Error ? e.message : "Could not list domains",
      });
    }
  }

  return NextResponse.json({
    pagesHost,
    domain: site.domain,
    domains,
    hasTransip: transipConfigured(),
  });
}

const postSchema = z.object({
  name: z.string().min(3).max(253),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = postSchema.parse(await req.json());
    const name = normalizeHostname(body.name);
    if (!isValidHostname(name)) {
      return NextResponse.json(
        { error: "Enter a valid domain, e.g. www.example.com" },
        { status: 400 },
      );
    }

    await prisma.site.update({
      where: { id: site.id },
      data: { domain: name },
    });

    const pagesHost = pagesHostForSite({
      slug: site.slug,
      cloudflareProject: site.cloudflareProject,
    });
    const dns = dnsHintForDomain(name, pagesHost);

    let attached: { name: string; status: string } | null = null;
    let attachError: string | null = null;
    if (cloudflareConfigured() && site.cloudflareProject) {
      try {
        attached = await addPagesDomain(site.cloudflareProject, name);
      } catch (e) {
        attachError =
          e instanceof Error
            ? e.message
            : "Could not attach domain yet. Publish first, then try again.";
      }
    }

    let guide = null;
    try {
      guide = await getDnsInstructions({
        hostname: name,
        recordName: dns.name,
        target: dns.target,
      });
    } catch (e) {
      console.warn("[dns-instructions]", e);
    }

    return NextResponse.json({
      domain: name,
      pagesHost,
      dns,
      attached,
      attachError,
      guide,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid domain" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save domain" },
      { status: 400 },
    );
  }
}

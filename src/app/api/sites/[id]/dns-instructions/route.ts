import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  dnsHintForDomain,
  isValidHostname,
  normalizeHostname,
  pagesHostForSite,
} from "@/lib/cloudflare-pages";
import { getDnsInstructions } from "@/lib/dns-instructions";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("domain") || site.domain || "";
  const hostname = normalizeHostname(raw);
  if (!isValidHostname(hostname)) {
    return NextResponse.json(
      { error: "Enter a valid domain first" },
      { status: 400 },
    );
  }

  const pagesHost = pagesHostForSite(site);
  const dns = dnsHintForDomain(hostname, pagesHost);

  try {
    const guide = await getDnsInstructions({
      hostname: dns.connectHost,
      recordName: dns.name,
      target: dns.target,
      recordType: dns.type,
    });
    return NextResponse.json({
      domain: hostname,
      pagesHost,
      dns,
      ...guide,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Could not load DNS instructions",
      },
      { status: 500 },
    );
  }
}

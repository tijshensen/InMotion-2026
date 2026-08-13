import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  addPagesDomain,
  cloudflareConfigured,
  dnsHintForDomain,
  ensureCloudflareZone,
  isValidHostname,
  normalizeHostname,
  pagesHostForSite,
} from "@/lib/cloudflare-pages";
import {
  apexFromHostname,
  setTransipNameservers,
  transipConfigured,
  upsertTransipCname,
} from "@/lib/transip";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().min(3).max(253),
  mode: z.enum(["cname", "nameservers"]),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  if (!transipConfigured()) {
    return NextResponse.json(
      {
        error:
          "TransIP is not configured. Add TRANSIP_LOGIN and TRANSIP_PRIVATE_KEY.",
      },
      { status: 400 },
    );
  }

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = schema.parse(await req.json());
    const name = normalizeHostname(body.name);
    if (!isValidHostname(name)) {
      return NextResponse.json(
        { error: "Enter a valid domain, e.g. www.example.com" },
        { status: 400 },
      );
    }

    const { apex, recordName, isApex } = apexFromHostname(name);
    const pagesHost = pagesHostForSite(site);

    await prisma.site.update({
      where: { id: site.id },
      data: { domain: name },
    });

    if (body.mode === "cname") {
      if (isApex) {
        return NextResponse.json(
          {
            error:
              "An apex domain (example.com) cannot use a plain CNAME at most registrars. Use www.example.com, or switch nameservers to Cloudflare.",
          },
          { status: 400 },
        );
      }
      await upsertTransipCname({
        apex,
        recordName,
        target: pagesHost,
      });
      let attached = null;
      let attachError: string | null = null;
      if (cloudflareConfigured() && (site.cloudflareProject || site.slug)) {
        try {
          attached = await addPagesDomain(
            site.cloudflareProject || site.slug,
            name,
          );
        } catch (e) {
          attachError = e instanceof Error ? e.message : String(e);
        }
      }
      return NextResponse.json({
        ok: true,
        mode: "cname",
        domain: name,
        pagesHost,
        message: `CNAME ${recordName} → ${pagesHost} saved at TransIP.`,
        attached,
        attachError,
        dns: dnsHintForDomain(name, pagesHost),
      });
    }

    // nameservers: create Cloudflare zone, then point TransIP at those NS
    if (!cloudflareConfigured()) {
      return NextResponse.json(
        { error: "Cloudflare credentials are required to create the zone." },
        { status: 400 },
      );
    }
    const zone = await ensureCloudflareZone(apex);
    if (!zone.nameServers.length) {
      throw new Error("Cloudflare did not return nameservers for this zone.");
    }
    await setTransipNameservers(apex, zone.nameServers);

    let attached = null;
    let attachError: string | null = null;
    try {
      attached = await addPagesDomain(
        site.cloudflareProject || site.slug,
        name,
      );
    } catch (e) {
      attachError = e instanceof Error ? e.message : String(e);
    }

    return NextResponse.json({
      ok: true,
      mode: "nameservers",
      domain: name,
      apex,
      nameServers: zone.nameServers,
      pagesHost,
      message: `TransIP nameservers for ${apex} are now ${zone.nameServers.join(" and ")}. DNS can take a few hours.`,
      attached,
      attachError,
      dns: dnsHintForDomain(name, pagesHost),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TransIP update failed" },
      { status: 400 },
    );
  }
}

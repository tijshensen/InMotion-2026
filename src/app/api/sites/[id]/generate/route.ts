import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { assertSiteAccess } from "@/lib/access";
import { generateStaticSite } from "@/lib/generate-site";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const denied = await assertSiteAccess(user, id, "ADMIN");
  if (denied) return denied;

  try {
    const result = await generateStaticSite(id);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[generate]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generate failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isPlatformSuperadmin } from "@/lib/access";
import {
  getImportPrompt,
  saveImportPrompt,
} from "@/lib/import-from-url";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prompt = await getImportPrompt();
  return NextResponse.json({ prompt });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPlatformSuperadmin(user)) {
    return NextResponse.json(
      { error: "Only superadmins can change the default prompt" },
      { status: 403 },
    );
  }

  try {
    const body = z
      .object({ prompt: z.string().min(1).max(4000) })
      .parse(await req.json());
    const prompt = await saveImportPrompt(body.prompt);
    return NextResponse.json({ prompt });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message || "Invalid prompt" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

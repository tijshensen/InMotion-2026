import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { postLoginPath, seedOnboardingReplayOnce } from "@/lib/onboarding";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { email, password } = bodySchema.parse(json);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await createSession(user.id);
    await seedOnboardingReplayOnce();
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, replayOnboarding: true },
    });
    const next = await postLoginPath(
      fresh ?? { id: user.id, replayOnboarding: user.replayOnboarding },
    );
    return NextResponse.json({ ok: true, next });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isOnboardingHost } from "@/lib/hosts";
import { getImportPrompt } from "@/lib/import-from-url";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) {
    const host = (await headers()).get("host") || "";
    redirect(isOnboardingHost(host) ? "/" : "/login");
  }

  const defaultBrief = await getImportPrompt();

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          Step by step
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Let&apos;s make your website
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as {user.email}
        </p>
        <OnboardingWizard defaultBrief={defaultBrief} />
      </div>
    </main>
  );
}

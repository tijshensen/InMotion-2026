import { getSessionUser } from "@/lib/auth";
import { StartLogin } from "./start-login";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  const { error } = await searchParams;
  const googleReady = Boolean(process.env.GOOGLE_CLIENT_ID);
  const next = "/onboarding";

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          made a website
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Your site, from a URL you like
        </h1>
        <p className="text-slate-600 leading-relaxed">
          Sign in with Google. We&apos;ll ask which website you want to look
          like, then build your first draft.
        </p>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <StartLogin
          signedIn={Boolean(user)}
          googleReady={googleReady}
          continueHref={next}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/admin");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center space-y-6">
        <p className="text-sm font-medium tracking-wide text-blue-600 uppercase">
          CMSinMotion
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Multi-site CMS, rebuilt
        </h1>
        <p className="text-slate-600 leading-relaxed">
          Modern rewrite of MotionCMS 3 — sites, pages, blocks, templates, and
          inserts. Admin first; public pages rendered from templates.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-white font-medium hover:bg-blue-700"
          >
            Sign in
          </Link>
          <Link
            href="/s/demo"
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            View demo site
          </Link>
        </div>
      </div>
    </main>
  );
}

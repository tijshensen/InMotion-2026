import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getActiveSite } from "@/lib/site-context";
import { MediaLibraryClient } from "./media-library-client";

export default async function MediaAdminPage() {
  await requireUser();
  const active = await getActiveSite();

  if (!active) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-sm text-slate-500">
          Select a website in the top bar first.
        </p>
      </div>
    );
  }

  const assets = await prisma.mediaAsset.findMany({
    where: { siteId: active.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-slate-500 mt-1">
          Images for{" "}
          <strong className="text-slate-700">{active.name}</strong>. Use them
          from the page editor Image button.
        </p>
      </div>

      <MediaLibraryClient
        siteId={active.id}
        siteName={active.name}
        initialAssets={JSON.parse(JSON.stringify(assets))}
      />
    </div>
  );
}

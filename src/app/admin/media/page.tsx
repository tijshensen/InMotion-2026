import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MediaLibraryClient } from "./media-library-client";

export default async function MediaAdminPage() {
  await requireUser();

  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const initialSiteId = sites[0]?.id || "";

  const assets = initialSiteId
    ? await prisma.mediaAsset.findMany({
        where: { siteId: initialSiteId },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Media</h1>
        <p className="text-slate-500 mt-1">
          Upload and manage images per site. Use them from the page editor Image
          button.
        </p>
      </div>

      <MediaLibraryClient
        sites={sites}
        initialSiteId={initialSiteId}
        initialAssets={JSON.parse(JSON.stringify(assets))}
      />
    </div>
  );
}

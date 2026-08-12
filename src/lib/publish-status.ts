/**
 * Detect whether a site has content changes since the last static publish.
 */

import { prisma } from "./db";

export async function siteHasUnpublishedChanges(siteId: string): Promise<{
  hasChanges: boolean;
  lastGeneratedAt: Date | null;
  lastContentAt: Date | null;
}> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { lastGeneratedAt: true },
  });
  if (!site) {
    return { hasChanges: false, lastGeneratedAt: null, lastContentAt: null };
  }

  const [latestPage, latestBlock] = await Promise.all([
    prisma.page.findFirst({
      where: { siteId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.pageBlock.findFirst({
      where: { page: { siteId } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const times = [latestPage?.updatedAt, latestBlock?.updatedAt].filter(
    (d): d is Date => Boolean(d),
  );
  const lastContentAt =
    times.length > 0
      ? new Date(Math.max(...times.map((d) => d.getTime())))
      : null;

  // Never published → allow Publish
  if (!site.lastGeneratedAt) {
    return {
      hasChanges: true,
      lastGeneratedAt: null,
      lastContentAt,
    };
  }

  // No content yet → nothing to publish
  if (!lastContentAt) {
    return {
      hasChanges: false,
      lastGeneratedAt: site.lastGeneratedAt,
      lastContentAt: null,
    };
  }

  const hasChanges = lastContentAt.getTime() > site.lastGeneratedAt.getTime();
  return {
    hasChanges,
    lastGeneratedAt: site.lastGeneratedAt,
    lastContentAt,
  };
}

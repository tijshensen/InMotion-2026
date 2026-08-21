import { prisma } from "./db";

export type SiteCloneSource = {
  url: string;
  /** Hostname without leading www, lowercased. */
  host: string;
  displayHost: string;
  origin: string;
};

function hostnameKey(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Exact-copy (scrape) origin for this site, or null if it is not a clone. */
export async function getSiteCloneSource(
  siteId: string,
): Promise<SiteCloneSource | null> {
  const rows = await prisma.siteSetting.findMany({
    where: { siteId, key: { in: ["importMode", "importedFromUrl"] } },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (map.importMode !== "clone") return null;
  const url = (map.importedFromUrl || "").trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      url,
      host: u.hostname.replace(/^www\./i, "").toLowerCase(),
      displayHost: u.hostname,
      origin: u.origin,
    };
  } catch {
    return null;
  }
}

export function sameCloneHost(candidateUrl: string, source: SiteCloneSource): boolean {
  const host = hostnameKey(candidateUrl);
  return Boolean(host && host === source.host);
}

export function cloneHostMismatchMessage(source: SiteCloneSource): string {
  return `This site was copied from ${source.displayHost}. Extra page templates must be scraped from that domain.`;
}

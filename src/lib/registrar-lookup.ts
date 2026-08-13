/**
 * Detect which registrar owns a domain via RDAP, then nameserver hints.
 */

import { normalizeHostname } from "./cloudflare-pages";

export type RegistrarInfo = {
  name: string;
  key: string;
  source: "rdap" | "nameserver" | "unknown";
};

const NS_HINTS: { match: RegExp; name: string }[] = [
  { match: /transip\./i, name: "TransIP" },
  { match: /registrar-servers\.com/i, name: "Namecheap" },
  { match: /domaincontrol\.com/i, name: "GoDaddy" },
  { match: /awsdns/i, name: "Amazon Route 53" },
  { match: /cloudflare\.com/i, name: "Cloudflare" },
  { match: /googledomains|domaincontrol-google|ns-cloud-.*\.googledomains/i, name: "Google Domains" },
  { match: /ovh\./i, name: "OVH" },
  { match: /hostnet\./i, name: "Hostnet" },
  { match: /versio\./i, name: "Versio" },
  { match: /strato\./i, name: "STRATO" },
  { match: /ionos|1and1|ui-dns/i, name: "IONOS" },
  { match: /hostinger/i, name: "Hostinger" },
  { match: /hostgator/i, name: "HostGator" },
  { match: /bluehost/i, name: "Bluehost" },
  { match: /hover\.com/i, name: "Hover" },
  { match: /name\.com/i, name: "Name.com" },
  { match: /gandi\.net/i, name: "Gandi" },
  { match: /one\.com/i, name: "One.com" },
  { match: /simply\.com|unoeuro/i, name: "Simply.com" },
  { match: /openprovider/i, name: "Openprovider" },
  { match: /registrar\.eu|realtime\.register/i, name: "Realtime Register" },
  { match: /sidn\.nl/i, name: "SIDN" },
  { match: /digitalocean/i, name: "DigitalOcean" },
  { match: /ns\.squarespace/i, name: "Squarespace" },
];

export function registrarCacheKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(b\.?v\.?|llc|l\.l\.c\.|inc|ltd|gmbh|n\.?v\.?|corp|corporation|limited|co\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80) || "unknown";
}

export function apexDomain(host: string) {
  const h = normalizeHostname(host);
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join(".");
}

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function nameFromRdap(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const entities = (data as { entities?: unknown[] }).entities;
  if (!Array.isArray(entities)) return null;

  const registrar = entities.find((e) => {
    const roles = (e as { roles?: string[] }).roles || [];
    return roles.includes("registrar");
  }) as { vcardArray?: unknown; handle?: string } | undefined;

  if (!registrar) return null;

  const vcard = registrar.vcardArray;
  if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
    for (const row of vcard[1] as unknown[]) {
      if (!Array.isArray(row)) continue;
      if (row[0] === "fn" && typeof row[3] === "string" && row[3].trim()) {
        return row[3].trim();
      }
    }
  }
  if (typeof registrar.handle === "string" && registrar.handle.trim()) {
    return registrar.handle.trim();
  }
  return null;
}

async function lookupRdap(apex: string): Promise<string | null> {
  const data = await fetchJson(`https://rdap.org/domain/${encodeURIComponent(apex)}`, {
    Accept: "application/rdap+json, application/json",
  });
  return nameFromRdap(data);
}

async function lookupNameservers(apex: string): Promise<string[]> {
  const data = await fetchJson(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(apex)}&type=NS`,
    { Accept: "application/dns-json" },
  );
  const answers = (data as { Answer?: { data?: string }[] } | null)?.Answer;
  if (!Array.isArray(answers)) return [];
  return answers
    .map((a) => String(a.data || "").replace(/\.$/, "").toLowerCase())
    .filter(Boolean);
}

function registrarFromNs(nameservers: string[]): string | null {
  for (const ns of nameservers) {
    for (const hint of NS_HINTS) {
      if (hint.match.test(ns)) return hint.name;
    }
  }
  return null;
}

export async function detectRegistrar(hostname: string): Promise<RegistrarInfo> {
  const apex = apexDomain(hostname);
  const rdapName = await lookupRdap(apex);
  if (rdapName) {
    return { name: rdapName, key: registrarCacheKey(rdapName), source: "rdap" };
  }
  const ns = await lookupNameservers(apex);
  const fromNs = registrarFromNs(ns);
  if (fromNs) {
    return { name: fromNs, key: registrarCacheKey(fromNs), source: "nameserver" };
  }
  return {
    name: "your domain registrar",
    key: "unknown",
    source: "unknown",
  };
}

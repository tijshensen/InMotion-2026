"use client";

import { useEffect, useMemo, useState } from "react";

export type PublishModalSite = {
  id: string;
  slug: string;
  domain: string | null;
  cloudflareProject: string;
  cloudflareUrl: string;
};

type Dest = "pages" | "custom";

type DnsHint = {
  apex: boolean;
  type: string;
  name: string;
  target: string;
};

type Props = {
  site: PublishModalSite;
  hasCloudflare: boolean;
  publishing: boolean;
  canPublish: boolean;
  onPublish: () => void;
};

export function PublishModal({
  site,
  hasCloudflare,
  publishing,
  canPublish,
  onPublish,
}: Props) {
  const pagesHost = `${(site.cloudflareProject || site.slug).toLowerCase()}.pages.dev`;
  const [dest, setDest] = useState<Dest>(site.domain ? "custom" : "pages");
  const [domainInput, setDomainInput] = useState(site.domain || "");
  const [savedDomain, setSavedDomain] = useState(site.domain || "");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [dns, setDns] = useState<DnsHint | null>(null);
  const [cfStatus, setCfStatus] = useState<string | null>(null);
  const [hasTransip, setHasTransip] = useState(false);
  const [applying, setApplying] = useState<"cname" | "nameservers" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/sites/${site.id}/cloudflare/domains`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setHasTransip(Boolean(data.hasTransip));
        if (data.domain) {
          setSavedDomain(data.domain);
          setDomainInput(data.domain);
        }
        const match = Array.isArray(data.domains)
          ? data.domains.find(
              (d: { name?: string }) => d.name === data.domain,
            )
          : null;
        if (match?.status) setCfStatus(match.status);
        if (data.domain && data.pagesHost) {
          const host = String(data.domain);
          const parts = host.split(".");
          const apex = parts[0] !== "www" && parts.length <= 2;
          setDns({
            apex,
            type: "CNAME",
            name: apex ? "@" : parts[0] || "www",
            target: data.pagesHost,
          });
        }
      } catch {
        /* ignore — wizard still works offline */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  const previewHost = useMemo(() => {
    const typed = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "");
    return typed || "domain.com";
  }, [domainInput]);

  async function applyAtTransip(mode: "cname" | "nameservers") {
    setApplying(mode);
    setConnectError(null);
    setConnectNote(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/cloudflare/domains/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: domainInput, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "TransIP update failed");
      if (data.domain) {
        setSavedDomain(data.domain);
        setDomainInput(data.domain);
      }
      if (data.dns) setDns(data.dns);
      setConnectNote(data.message || "Updated at TransIP.");
      if (data.attachError) {
        setConnectNote(
          `${data.message || "Updated at TransIP."} ${data.attachError}`,
        );
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "TransIP update failed");
    } finally {
      setApplying(null);
    }
  }

  async function connectDomain(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setConnectError(null);
    setConnectNote(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/cloudflare/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: domainInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save domain");
      setSavedDomain(data.domain || domainInput);
      if (data.dns) setDns(data.dns);
      if (data.attachError) {
        setConnectNote(
          `${data.attachError} Publish changes first — the domain is saved and will be attached then.`,
        );
      } else if (data.attached) {
        setCfStatus(data.attached.status);
        setConnectNote("Domain saved. Finish the DNS record below, then publish.");
      } else {
        setConnectNote("Domain saved. Add the DNS record, then publish.");
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Could not save domain");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-1.5 w-[22.5rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left shadow-2xl">
      <div className="border-b border-slate-800 px-3.5 py-2.5">
        <p className="text-sm font-semibold text-white">Publish</p>
        <p className="text-[11px] text-slate-500">
          Choose where this site will be live
        </p>
      </div>

      <div className="p-2 space-y-1">
        <label
          className={[
            "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2",
            dest === "pages" ? "bg-slate-800" : "hover:bg-slate-800/60",
          ].join(" ")}
        >
          <input
            type="radio"
            name="publish-dest"
            className="mt-1 accent-blue-500"
            checked={dest === "pages"}
            onChange={() => setDest("pages")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[13px] text-slate-100">
              {pagesHost}
            </span>
            <span className="block text-[11px] text-slate-500">
              Included Cloudflare URL
            </span>
          </span>
          {site.cloudflareUrl && (
            <a
              href={site.cloudflareUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-[11px] text-orange-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open ↗
            </a>
          )}
        </label>

        <label
          className={[
            "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2",
            dest === "custom" ? "bg-slate-800" : "hover:bg-slate-800/60",
          ].join(" ")}
        >
          <input
            type="radio"
            name="publish-dest"
            className="mt-1 accent-blue-500"
            checked={dest === "custom"}
            onChange={() => setDest("custom")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[13px] text-slate-100">
              {savedDomain || previewHost || "domain.com"}
            </span>
            <span className="block text-[11px] text-slate-500">
              {savedDomain
                ? cfStatus
                  ? `Custom domain · ${cfStatus}`
                  : "Custom domain"
                : "Connect a domain you own"}
            </span>
          </span>
        </label>
      </div>

      {dest === "custom" && (
        <div className="mx-2 mb-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 space-y-2">
          <p className="text-[11px] font-medium text-slate-300">
            Connect a domain
          </p>
          <form onSubmit={(e) => void connectDomain(e)} className="space-y-2">
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="www.example.com"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white placeholder:text-slate-600"
            />
            <button
              type="submit"
              disabled={connecting || !domainInput.trim()}
              className="w-full rounded-md border border-slate-600 px-2 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {connecting ? "Saving…" : savedDomain ? "Update domain" : "Save domain"}
            </button>
          </form>

          {(dns || domainInput.includes(".")) && (
            <div className="rounded-md bg-slate-900 px-2 py-2 text-[11px] text-slate-400 space-y-1.5">
              <p className="font-medium text-slate-300">DNS record</p>
              <table className="w-full font-mono text-[10px]">
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-2 text-slate-500">Type</td>
                    <td>CNAME</td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-2 text-slate-500">Name</td>
                    <td>
                      {dns?.name ||
                        (previewHost.split(".").length <= 2
                          ? "@"
                          : previewHost.split(".")[0])}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-2 text-slate-500">Target</td>
                    <td className="break-all">{pagesHost}</td>
                  </tr>
                </tbody>
              </table>
              {(dns?.apex ||
                (previewHost.split(".").length <= 2 &&
                  !previewHost.startsWith("www."))) && (
                <p>
                  Apex domains work best if the zone is on Cloudflare
                  (nameservers at Cloudflare). Otherwise use CNAME flattening
                  for <code className="text-slate-300">@</code>.
                </p>
              )}
              <p>
                Add the record at your DNS provider, then publish. SSL is
                issued automatically after DNS is live.
              </p>
            </div>
          )}

          {hasTransip ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-300">
                Apply at TransIP
              </p>
              <button
                type="button"
                disabled={!domainInput.trim() || applying !== null}
                onClick={() => void applyAtTransip("cname")}
                className="w-full rounded-md bg-slate-800 px-2 py-1.5 text-[11px] font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
              >
                {applying === "cname"
                  ? "Adding CNAME…"
                  : "Add CNAME at TransIP (keep TransIP DNS)"}
              </button>
              <button
                type="button"
                disabled={!domainInput.trim() || applying !== null}
                onClick={() => {
                  if (
                    !window.confirm(
                      "This points the domain’s nameservers to Cloudflare. Mail and other DNS at TransIP will stop unless those records are copied to Cloudflare first. Continue?",
                    )
                  ) {
                    return;
                  }
                  void applyAtTransip("nameservers");
                }}
                className="w-full rounded-md border border-amber-700/70 px-2 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-950/40 disabled:opacity-50"
              >
                {applying === "nameservers"
                  ? "Updating nameservers…"
                  : "Set Cloudflare nameservers at TransIP"}
              </button>
              <p className="text-[10px] leading-snug text-slate-500">
                Prefer CNAME for www. Nameserver change is only needed for a
                bare domain (example.com) and moves all DNS to Cloudflare.
              </p>
            </div>
          ) : (
            <p className="text-[10px] leading-snug text-slate-500">
              To apply this automatically at TransIP, add{" "}
              <code className="text-slate-400">TRANSIP_LOGIN</code> and{" "}
              <code className="text-slate-400">TRANSIP_PRIVATE_KEY</code> to
              .env and restart.
            </p>
          )}

          {connectNote && (
            <p className="text-[11px] text-emerald-400">{connectNote}</p>
          )}
          {connectError && (
            <p className="text-[11px] text-red-400">{connectError}</p>
          )}
        </div>
      )}

      {!hasCloudflare && (
        <p className="px-3.5 pb-2 text-[11px] text-amber-400/90">
          Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to deploy to
          Pages. Publish still generates files on this server.
        </p>
      )}

      <div className="border-t border-slate-800 p-2.5">
        <button
          type="button"
          disabled={!canPublish || publishing}
          onClick={() => onPublish()}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing ? "Publishing…" : "Publish changes"}
        </button>
      </div>
    </div>
  );
}

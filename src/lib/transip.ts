/**
 * TransIP REST API v6 — auth + nameservers + DNS.
 * Env: TRANSIP_LOGIN + TRANSIP_PRIVATE_KEY (PEM from the control panel).
 */

import { createSign, randomBytes } from "crypto";

const TRANSIP_API = "https://api.transip.nl/v6";

export function transipConfigured() {
  return Boolean(transipLogin() && transipPrivateKey());
}

function transipLogin() {
  return String(process.env["TRANSIP_LOGIN"] ?? "").trim();
}

function transipPrivateKey() {
  const raw = String(process.env["TRANSIP_PRIVATE_KEY"] ?? "").trim();
  if (!raw) return "";
  return raw.replace(/\\n/g, "\n");
}

let cachedToken: { token: string; exp: number } | null = null;

function signBody(body: string): string {
  const key = transipPrivateKey();
  const sign = createSign("SHA512");
  sign.update(body);
  sign.end();
  return sign.sign(key, "base64");
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.token;
  const login = transipLogin();
  if (!login || !transipPrivateKey()) {
    throw new Error("Set TRANSIP_LOGIN and TRANSIP_PRIVATE_KEY to apply DNS at TransIP.");
  }
  const payload = {
    login,
    nonce: randomBytes(12).toString("hex"),
    read_only: false,
    expiration_time: "30 minutes",
    label: "cmsinmotion",
    global_key: true,
  };
  const body = JSON.stringify(payload);
  const res = await fetch(`${TRANSIP_API}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Signature: signBody(body),
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
  };
  if (!res.ok || !json.token) {
    throw new Error(json.error || `TransIP auth failed (${res.status})`);
  }
  cachedToken = { token: json.token, exp: Date.now() + 20 * 60 * 1000 };
  return json.token;
}

async function tipFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; json: T & { error?: string } }> {
  const token = await getToken();
  const res = await fetch(`${TRANSIP_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `TransIP ${res.status} on ${path}`);
  }
  return { status: res.status, json };
}

export function apexFromHostname(host: string): {
  apex: string;
  recordName: string;
  isApex: boolean;
} {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return { apex: host, recordName: "@", isApex: true };
  }
  return {
    apex: parts.slice(1).join("."),
    recordName: parts[0] || "www",
    isApex: false,
  };
}

export async function setTransipNameservers(
  apex: string,
  hostnames: string[],
): Promise<void> {
  await tipFetch(`/domains/${encodeURIComponent(apex)}/nameservers`, {
    method: "PUT",
    body: JSON.stringify({
      nameservers: hostnames.map((hostname) => ({
        hostname,
        ipv4: "",
        ipv6: "",
      })),
    }),
  });
}

export async function upsertTransipCname(opts: {
  apex: string;
  recordName: string;
  target: string;
}): Promise<void> {
  const content = opts.target.replace(/\.$/, "") + ".";
  const dnsEntry = {
    name: opts.recordName,
    expire: 300,
    type: "CNAME",
    content,
  };
  try {
    await tipFetch(`/domains/${encodeURIComponent(opts.apex)}/dns`, {
      method: "POST",
      body: JSON.stringify({ dnsEntry }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already|exist|duplicate/i.test(msg)) {
      // Update existing record
      try {
        await tipFetch(`/domains/${encodeURIComponent(opts.apex)}/dns`, {
          method: "PATCH",
          body: JSON.stringify({ dnsEntry }),
        });
        return;
      } catch {
        throw e;
      }
    }
    await tipFetch(`/domains/${encodeURIComponent(opts.apex)}/dns`, {
      method: "PATCH",
      body: JSON.stringify({ dnsEntry }),
    });
  }
}

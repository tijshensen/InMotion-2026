/**
 * Easy DNS instructions: cache per registrar, generate with Grok when missing.
 */

import { prisma } from "./db";
import { grokChat, xaiApiKey } from "./xai";
import { detectRegistrar } from "./registrar-lookup";

export type DnsInstructions = {
  registrar: string;
  registrarKey: string;
  cached: boolean;
  instructions: string;
  source: "rdap" | "nameserver" | "unknown";
};

const GROK_SYSTEM = `You are helping a non-technical user set up a custom domain.
Registrar: {registrar}
Domain: {domain}
Record type: {record_type}
Name/Host: {subdomain or @}
Value/Target: {cname_target}
TTL: Automatic or 3600

Write clear, numbered, step-by-step instructions for this exact registrar.
- Use simple language a complete beginner can follow.
- Mention exactly where to click.
- Keep it under 120 words.
- Do not explain what DNS is.
- Do not tell them to create a CNAME named @ (that is not allowed).
- End with: “Save the record. It can take a few minutes to a few hours to become active.”`;

function fillPrompt(vars: {
  registrar: string;
  domain: string;
  recordType: string;
  name: string;
  target: string;
}) {
  return GROK_SYSTEM.replace("{registrar}", vars.registrar)
    .replace("{domain}", vars.domain)
    .replace("{record_type}", vars.recordType)
    .replace("{subdomain or @}", vars.name)
    .replace("{cname_target}", vars.target);
}

function guideCacheKey(registrarKey: string, recordType: string, recordName: string) {
  return `${registrarKey}:${recordType.toLowerCase()}:${recordName.toLowerCase()}`;
}

export async function getDnsInstructions(opts: {
  hostname: string;
  recordName: string;
  target: string;
  recordType?: string;
}): Promise<DnsInstructions> {
  const detected = await detectRegistrar(opts.hostname);
  const recordType = opts.recordType || "CNAME";
  const cacheKey =
    detected.key === "unknown"
      ? "unknown"
      : guideCacheKey(detected.key, recordType, opts.recordName);

  if (cacheKey !== "unknown") {
    const existing = await prisma.registrarDnsGuide.findUnique({
      where: { registrarKey: cacheKey },
    });
    if (existing?.instructions) {
      return {
        registrar: existing.registrarName,
        registrarKey: existing.registrarKey,
        cached: true,
        instructions: existing.instructions,
        source: detected.source,
      };
    }
  }

  let instructions = "";
  if (xaiApiKey()) {
    instructions = await grokChat({
      system: "You write short, numbered setup instructions. No preamble, no markdown headings.",
      user: fillPrompt({
        registrar: detected.name,
        domain: opts.hostname,
        recordType,
        name: opts.recordName,
        target: opts.target,
      }),
      temperature: 0.2,
      timeoutMs: 45_000,
    });
  } else {
    instructions = fallbackInstructions(detected.name, {
      ...opts,
      recordType,
    });
  }

  instructions = instructions.trim();

  if (cacheKey !== "unknown" && instructions) {
    await prisma.registrarDnsGuide.upsert({
      where: { registrarKey: cacheKey },
      create: {
        registrarKey: cacheKey,
        registrarName: detected.name,
        instructions,
      },
      update: {
        registrarName: detected.name,
        instructions,
      },
    });
  }

  return {
    registrar: detected.name,
    registrarKey: detected.key,
    cached: false,
    instructions,
    source: detected.source,
  };
}

function fallbackInstructions(
  registrar: string,
  opts: {
    hostname: string;
    recordName: string;
    target: string;
    recordType?: string;
  },
) {
  const type = opts.recordType || "CNAME";
  return [
    `1. Log in to ${registrar} and open the domain ${opts.hostname}.`,
    `2. Click DNS, DNS management, or Manage DNS records.`,
    `3. Click Add record and choose ${type}.`,
    `4. Set Name/Host to ${opts.recordName} and Value/Target to ${opts.target}.`,
    `5. Set TTL to Automatic or 3600.`,
    `Save the record. It can take a few minutes to a few hours to become active.`,
  ].join("\n");
}

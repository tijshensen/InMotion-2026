/**
 * Publish a generated static site to Cloudflare Pages (Direct Upload API).
 * Same protocol Wrangler uses — no wrangler binary required.
 *
 * Env: CLOUDFLARE_API_TOKEN (Account → Cloudflare Pages → Edit)
 *      CLOUDFLARE_ACCOUNT_ID
 */

import { createHash, randomBytes } from "crypto";
import fs from "fs";
import https from "https";
import os from "os";
import path from "path";
import { prisma } from "./db";
import { generatedSiteAbsDir, uploadsRoot } from "./paths";

const CF_API = "https://api.cloudflare.com/client/v4";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UPLOAD_BATCH = 20;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".xml", ".map"]);

export type CloudflarePublishResult = {
  project: string;
  url: string;
  deploymentId: string;
  files: number;
};

/** Bracket access so Next.js does not inline these at build time. */
function readEnv(name: string) {
  return String(process.env[name] ?? "").trim();
}

export function cloudflareConfigured() {
  return Boolean(cloudflareToken() && cloudflareAccountId());
}

export function cloudflareToken() {
  return readEnv("CLOUDFLARE_API_TOKEN");
}

export function cloudflareAccountId() {
  return readEnv("CLOUDFLARE_ACCOUNT_ID");
}

export type CloudflareStatus = {
  configured: boolean;
  ok: boolean;
  accountIdSuffix: string;
  projectCount: number | null;
  error: string | null;
};

/** Live check: token valid + can list Pages projects. */
export async function verifyCloudflareConnection(): Promise<CloudflareStatus> {
  const token = cloudflareToken();
  const accountId = cloudflareAccountId();
  if (!token || !accountId) {
    return {
      configured: false,
      ok: false,
      accountIdSuffix: "",
      projectCount: null,
      error: "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is missing",
    };
  }
  const accountIdSuffix = accountId.slice(-4);
  try {
    const projects = await cfFetch<unknown[]>(
      `/accounts/${accountId}/pages/projects?per_page=50`,
    );
    return {
      configured: true,
      ok: true,
      accountIdSuffix,
      projectCount: Array.isArray(projects) ? projects.length : 0,
      error: null,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      accountIdSuffix,
      projectCount: null,
      error: `Cloudflare Pages API failed: ${e instanceof Error ? e.message : String(e)}. Check the token has Account → Cloudflare Pages → Edit.`,
    };
  }
}

/** Pages project names: start with a letter, lowercase alphanumerics + hyphens. */
export function sanitizePagesProjectName(raw: string) {
  let s = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
  if (!s || !/^[a-z]/.test(s)) s = `site-${s || "web"}`.slice(0, 58);
  return s;
}

type CfErrorBody = {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: unknown;
};

class CloudflareApiError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

function throwIfCfFailed(apiPath: string, status: number, json: CfErrorBody) {
  if (status >= 200 && status < 300 && json.success !== false) {
    return;
  }
  const first = json.errors?.[0];
  throw new CloudflareApiError(
    first?.message || `Cloudflare API ${status} on ${apiPath}`,
    first?.code,
  );
}

async function cfFetch<T>(
  apiPath: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token: initToken, ...rest } = init;
  const token = initToken || cloudflareToken();
  const headers = new Headers(rest.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (rest.body && typeof rest.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${CF_API}${apiPath}`, { ...rest, headers });
  const json = (await res.json().catch(() => ({}))) as CfErrorBody;
  throwIfCfFailed(apiPath, res.status, json);
  return json.result as T;
}

/** Multipart POST that bypasses Next.js's patched fetch (which drops the boundary → HTTP 415). */
function cfMultipart<T>(
  apiPath: string,
  fields: Record<string, string>,
): Promise<T> {
  const boundary = `----cmsinmotion${randomBytes(12).toString("hex")}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  const url = new URL(`${CF_API}${apiPath}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${cloudflareToken()}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        const out: Buffer[] = [];
        res.on("data", (c: Buffer) => out.push(c));
        res.on("end", () => {
          const text = Buffer.concat(out).toString("utf8");
          let json: CfErrorBody = {};
          try {
            json = JSON.parse(text) as CfErrorBody;
          } catch {
            reject(
              new CloudflareApiError(
                `Cloudflare API ${res.statusCode} on ${apiPath}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          try {
            throwIfCfFailed(apiPath, res.statusCode || 0, json);
            resolve(json.result as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function copyDir(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Make generated HTML work at the domain root (not /sites/{slug}/). */
export function rewriteForStandalone(html: string, siteSlug: string): string {
  const esc = siteSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let s = html;
  // Do /sites/ first — "/sites/foo/" contains the substring "/s/foo/".
  s = s.replace(new RegExp(`/sites/${esc}/`, "g"), "/");
  s = s.replace(new RegExp(`/sites/${esc}(?=["'\\s>/]|$)`, "g"), "/");
  // Live-preview paths only (never a substring of /sites/)
  s = s.replace(
    new RegExp(`(href|src)=(["'])/s/${esc}/`, "g"),
    "$1=$2/",
  );
  s = s.replace(
    new RegExp(`(href|src)=(["'])/s/${esc}\\2`, "g"),
    "$1=$2/",
  );
  return s;
}

const PUBLISH_HEADER_CSS = `/* CMSinMotion: keep Bootstrap 3 header intact on Pages */
@media (min-width: 768px) {
  .navbar-toggle { display: none !important; }
  .visible-xs, .visible-xs-block, .visible-xs-inline, .visible-xs-inline-block {
    display: none !important;
  }
  .hidden-xs { display: block !important; }
  .head.hidden-xs { display: block !important; }
  .navbar-collapse.collapse {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
    visibility: visible !important;
  }
  .navbar-nav { float: left; margin: 0; }
  .navbar-nav > li { float: left; }
  .navbar-nav > li > .dropdown-menu { display: none; }
  .navbar-nav > li.open > .dropdown-menu,
  .navbar-nav > li:hover > .dropdown-menu { display: block; }
}
`;

function injectStandaloneStylesheets(html: string): string {
  const extras = [
    "/assets/css/bootstrap.min.css",
    "/assets/css/style.css",
    "/assets/css/cms-publish.css",
  ];
  const tags = extras
    .filter((href) => {
      const file = href.split("/").pop() || "";
      return file && !html.includes(file);
    })
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  if (!tags) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tags}\n</head>`);
  return tags + html;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".DS_Store" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(root);
  return out;
}

function rewriteTextFiles(root: string, siteSlug: string) {
  for (const file of walkFiles(root)) {
    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = rewriteForStandalone(before, siteSlug);
    if (after !== before) fs.writeFileSync(file, after, "utf8");
  }
}

function copyReferencedUploads(bundleRoot: string, siteSlug: string) {
  const uploads = uploadsRoot();
  const copied = new Set<string>();

  const copyOne = (rel: string) => {
    const clean = rel.replace(/^\/+/, "");
    if (copied.has(clean)) return;
    copied.add(clean);
    const from = path.join(uploads, clean);
    const to = path.join(bundleRoot, "uploads", clean);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  };

  // Whole site folder
  const siteUploads = path.join(uploads, siteSlug);
  if (fs.existsSync(siteUploads)) {
    copyDir(siteUploads, path.join(bundleRoot, "uploads", siteSlug));
  }

  for (const file of walkFiles(bundleRoot)) {
    if (path.extname(file).toLowerCase() !== ".html") continue;
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/\/uploads\/([a-zA-Z0-9._\/-]+)/g)) {
      if (m[1]) copyOne(m[1]);
    }
  }
}

function writePagesHeaders(bundleRoot: string) {
  const headers = [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
    "/*.html",
    "  Cache-Control: public, max-age=0, must-revalidate",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/uploads/*",
    "  Cache-Control: public, max-age=86400",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(bundleRoot, "_headers"), headers, "utf8");
}

export function prepareStandaloneBundle(site: { slug: string }): string {
  const src = generatedSiteAbsDir(site);
  if (!fs.existsSync(src)) {
    throw new Error(
      `Generated site not found. Publish locally first so files exist for "${site.slug}".`,
    );
  }
  const dest = path.join(os.tmpdir(), `cms-cf-${site.slug}-${Date.now()}`);
  copyDir(src, dest);
  rewriteTextFiles(dest, site.slug);
  copyReferencedUploads(dest, site.slug);
  const cssDir = path.join(dest, "assets", "css");
  fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(path.join(cssDir, "cms-publish.css"), PUBLISH_HEADER_CSS, "utf8");
  for (const file of walkFiles(dest)) {
    if (path.extname(file).toLowerCase() !== ".html") continue;
    const before = fs.readFileSync(file, "utf8");
    const after = injectStandaloneStylesheets(before);
    if (after !== before) fs.writeFileSync(file, after, "utf8");
  }
  writePagesHeaders(dest);
  return dest;
}

/** Wrangler-compatible asset hash (sha256(bytes + extension).hex[:32]). */
function hashFile(filePath: string): string {
  return createHash("sha256")
    .update(fs.readFileSync(filePath))
    .update(filePath.substring(filePath.lastIndexOf(".")))
    .digest("hex")
    .slice(0, 32);
}

type FileEntry = {
  name: string;
  path: string;
  hash: string;
  size: number;
  contentType: string;
};

function collectFiles(root: string): FileEntry[] {
  const ignore = new Set(["_headers", "_redirects", "_routes.json", "_worker.js"]);
  const files: FileEntry[] = [];
  for (const abs of walkFiles(root)) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (ignore.has(rel.split("/")[0] || "")) continue;
    const st = fs.statSync(abs);
    if (st.size > MAX_FILE_BYTES) {
      throw new Error(`File too large for Pages (25 MiB): ${rel}`);
    }
    const ext = path.extname(rel).toLowerCase();
    files.push({
      name: rel,
      path: abs,
      hash: hashFile(abs),
      size: st.size,
      contentType: MIME[ext] || "application/octet-stream",
    });
  }
  return files;
}

async function ensureProject(accountId: string, projectName: string) {
  try {
    await cfFetch(`/accounts/${accountId}/pages/projects/${projectName}`);
    return;
  } catch (e) {
    const notFound =
      e instanceof CloudflareApiError &&
      (e.code === 8000007 || /not found/i.test(e.message));
    if (!notFound) throw e;
  }
  await cfFetch(`/accounts/${accountId}/pages/projects`, {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      production_branch: "production",
    }),
  });
}

async function getUploadJwt(accountId: string, projectName: string): Promise<string> {
  try {
    const r = await cfFetch<{ jwt: string }>(
      `/accounts/${accountId}/pages/projects/${projectName}/upload-token`,
    );
    return r.jwt;
  } catch {
    const r = await cfFetch<{ jwt: string }>(
      `/accounts/${accountId}/pages/projects/${projectName}/upload-token`,
      { method: "POST" },
    );
    return r.jwt;
  }
}

async function uploadAssets(
  jwt: string,
  files: FileEntry[],
): Promise<Record<string, string>> {
  const hashes = files.map((f) => f.hash);
  let missing: string[] = hashes;
  try {
    missing = await cfFetch<string[]>("/pages/assets/check-missing", {
      method: "POST",
      token: jwt,
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ hashes }),
    });
  } catch {
    // If check-missing fails, upload everything
    missing = hashes;
  }

  const need = new Set(missing);
  const toUpload = files.filter((f) => need.has(f.hash));

  for (let i = 0; i < toUpload.length; i += UPLOAD_BATCH) {
    const batch = toUpload.slice(i, i + UPLOAD_BATCH);
    const payload = batch.map((f) => ({
      key: f.hash,
      value: fs.readFileSync(f.path).toString("base64"),
      metadata: { contentType: f.contentType },
      base64: true,
    }));
    await cfFetch("/pages/assets/upload", {
      method: "POST",
      token: jwt,
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(payload),
    });
  }

  try {
    await cfFetch("/pages/assets/upsert-hashes", {
      method: "POST",
      token: jwt,
      headers: { Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ hashes }),
    });
  } catch {
    // Non-fatal — next deploy may re-upload
  }

  const manifest: Record<string, string> = {};
  for (const f of files) {
    manifest[`/${f.name}`] = f.hash;
  }
  return manifest;
}

async function createDeployment(
  accountId: string,
  projectName: string,
  manifest: Record<string, string>,
  headersFile?: string,
): Promise<{ id: string; url: string }> {
  const fields: Record<string, string> = {
    manifest: JSON.stringify(manifest),
    branch: "production",
    commit_message: "Published from CMSinMotion",
    commit_dirty: "true",
  };
  if (headersFile && fs.existsSync(headersFile)) {
    fields._headers = fs.readFileSync(headersFile, "utf8");
  }

  return cfMultipart<{ id: string; url: string }>(
    `/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    fields,
  );
}

export type PagesDomain = {
  name: string;
  status: string;
};

export function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function isValidHostname(host: string): boolean {
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host);
}

export function isApexHostname(host: string): boolean {
  const parts = host.split(".").filter(Boolean);
  if (parts[0] === "www") return false;
  return parts.length <= 2;
}

export function dnsHintForDomain(host: string, pagesHost: string): {
  apex: boolean;
  type: string;
  name: string;
  target: string;
} {
  const parts = host.split(".").filter(Boolean);
  const apex = isApexHostname(host);
  return {
    apex,
    type: "CNAME",
    name: apex ? "@" : parts[0] || "www",
    target: pagesHost,
  };
}

export function pagesHostForSite(site: { slug: string; cloudflareProject?: string | null }) {
  return `${sanitizePagesProjectName(site.cloudflareProject || site.slug)}.pages.dev`;
}

export async function listPagesDomains(projectName: string): Promise<PagesDomain[]> {
  const accountId = cloudflareAccountId();
  const project = sanitizePagesProjectName(projectName);
  try {
    const result = await cfFetch<PagesDomain[] | { name?: string; status?: string }[]>(
      `/accounts/${accountId}/pages/projects/${project}/domains`,
    );
    if (!Array.isArray(result)) return [];
    return result.map((d) => ({
      name: d.name || "",
      status: d.status || "unknown",
    })).filter((d) => d.name);
  } catch (e) {
    if (e instanceof CloudflareApiError && (e.code === 8000007 || /not found/i.test(e.message))) {
      return [];
    }
    throw e;
  }
}

export async function addPagesDomain(
  projectName: string,
  hostname: string,
): Promise<PagesDomain> {
  const accountId = cloudflareAccountId();
  const project = sanitizePagesProjectName(projectName);
  const name = normalizeHostname(hostname);
  if (!isValidHostname(name)) {
    throw new Error("Enter a valid domain, e.g. www.example.com");
  }
  try {
    const result = await cfFetch<PagesDomain>(
      `/accounts/${accountId}/pages/projects/${project}/domains`,
      { method: "POST", body: JSON.stringify({ name }) },
    );
    return { name: result.name || name, status: result.status || "pending" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exists|already been added|taken/i.test(msg)) {
      return { name, status: "active" };
    }
    throw e;
  }
}

export async function publishSiteToCloudflare(siteId: string): Promise<CloudflarePublishResult> {
  if (!cloudflareConfigured()) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to publish to Pages.",
    );
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Site not found");

  const project = sanitizePagesProjectName(site.cloudflareProject || site.slug);
  const accountId = cloudflareAccountId();
  const bundleDir = prepareStandaloneBundle(site);

  try {
    await ensureProject(accountId, project);
    const jwt = await getUploadJwt(accountId, project);
    const files = collectFiles(bundleDir);
    if (!files.length) throw new Error("Standalone bundle is empty");
    const manifest = await uploadAssets(jwt, files);
    const deployment = await createDeployment(
      accountId,
      project,
      manifest,
      path.join(bundleDir, "_headers"),
    );

    const url = `https://${project}.pages.dev`;
    if (site.domain) {
      try {
        await addPagesDomain(project, site.domain);
      } catch (e) {
        console.warn("[cloudflare] attach domain", e);
      }
    }
    await prisma.site.update({
      where: { id: site.id },
      data: {
        cloudflareProject: project,
        cloudflareUrl: url,
        lastCloudflareAt: new Date(),
      },
    });

    return {
      project,
      url,
      deploymentId: deployment.id,
      files: files.length,
    };
  } finally {
    fs.rmSync(bundleDir, { recursive: true, force: true });
  }
}

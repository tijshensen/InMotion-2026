/**
 * Hosts:
 *   i.madeawebsite.com          → Railway (this app, Google OAuth, session)
 *   madeawebsite.com + *        → Cloudflare Pages (static landings only)
 *
 * Landing domains must never be attached to Railway.
 */

/** Railway app public origin, e.g. https://i.madeawebsite.com */
export function appPublicUrl() {
  return (process.env.CMS_PUBLIC_URL || "").replace(/\/$/, "");
}

/** @deprecated use appPublicUrl */
export function cmsPublicUrl() {
  return appPublicUrl();
}

export function hostnameOf(hostHeader: string) {
  return hostHeader.toLowerCase().split(":")[0];
}

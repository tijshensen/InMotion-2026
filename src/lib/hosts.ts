/** Public hosts for the CMS (i.) and onboarding (mymother.). */

export function cmsPublicUrl() {
  return (process.env.CMS_PUBLIC_URL || "").replace(/\/$/, "");
}

export function onboardingHost() {
  return (process.env.ONBOARDING_HOST || "").toLowerCase().split(":")[0];
}

export function authCookieDomain() {
  const d = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return d || undefined;
}

export function hostnameOf(hostHeader: string) {
  return hostHeader.toLowerCase().split(":")[0];
}

export function isOnboardingHost(hostHeader: string) {
  const want = onboardingHost();
  if (!want) return false;
  return hostnameOf(hostHeader) === want;
}

export function cmsOnboardingUrl() {
  const base = cmsPublicUrl();
  return base ? `${base}/onboarding` : "/onboarding";
}

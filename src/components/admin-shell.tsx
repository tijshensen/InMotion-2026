"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  useEditorChrome,
  type CanvasDevice,
  type EditorMode,
} from "@/components/editor-chrome-context";
import { PublishModal } from "@/components/publish-modal";

export type AdminPageOption = {
  id: string;
  title: string;
  menuTitle: string;
  slug: string;
  isHidden: boolean;
  isDefault: boolean;
};

export type AdminShellProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  activeSite: {
    id: string;
    name: string;
    slug: string;
    cssFramework: string;
    lastGeneratedAt: string | null;
    domain: string | null;
    cloudflareProject: string;
    cloudflareUrl: string;
  } | null;
  pages: AdminPageOption[];
  hasUnpublishedChanges: boolean;
  hasCloudflare: boolean;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
};

const NAV_COLLAPSED_KEY = "cms_admin_nav_collapsed";

export function AdminShell({
  user,
  activeSite,
  pages,
  hasUnpublishedChanges,
  hasCloudflare,
  nav,
  children,
}: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { chrome } = useEditorChrome();
  const [pending, startTransition] = useTransition();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [pageMenuPos, setPageMenuPos] = useState({ top: 0, left: 0, width: 320 });
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [localHasChanges, setLocalHasChanges] = useState(hasUnpublishedChanges);

  const pageMenuRef = useRef<HTMLDivElement>(null);
  const publishMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(56);

  /** Page canvas editor route: /admin/pages/[id] */
  const isCanvas = Boolean(pathname.match(/^\/admin\/pages\/[^/]+$/));

  useEffect(() => {
    setLocalHasChanges(hasUnpublishedChanges);
  }, [hasUnpublishedChanges]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(NAV_COLLAPSED_KEY);
      if (v === "1") setNavCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Canvas mode: auto-collapse left nav so the page is top bar + canvas only
  useEffect(() => {
    if (isCanvas) setNavCollapsed(true);
  }, [isCanvas]);

  // Measure top bar so fixed panels never sit underneath it
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => setHeaderH(el.getBoundingClientRect().height);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isCanvas, chrome]);

  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Position page dropdown in viewport coords (avoids header overflow clipping)
  useEffect(() => {
    if (!pageMenuOpen || !pageMenuRef.current) return;
    const place = () => {
      const r = pageMenuRef.current!.getBoundingClientRect();
      setPageMenuPos({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, 280),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [pageMenuOpen]);

  // Close menus on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (pageMenuRef.current && !pageMenuRef.current.contains(t)) {
        // also allow clicks inside the fixed list (rendered as child of pageMenuRef)
        setPageMenuOpen(false);
      }
      if (publishMenuRef.current && !publishMenuRef.current.contains(t)) {
        setPublishOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredPages = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    const list = pages.filter((p) => {
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.menuTitle.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
      );
    });
    return list;
  }, [pages, pageQuery]);

  const currentPage = useMemo(() => {
    const m = pathname.match(/^\/admin\/pages\/([^/]+)/);
    if (!m) return null;
    return pages.find((p) => p.id === m[1]) || null;
  }, [pathname, pages]);

  async function onPublish() {
    if (!activeSite || publishing) return;
    if (!localHasChanges && !hasCloudflare) return;
    setPublishing(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/sites/${activeSite.id}/generate`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || "Publish failed");
        return;
      }
      setLocalHasChanges(false);
      const cf = data.cloudflare as
        | { url?: string; project?: string; error?: string; skipped?: string }
        | undefined;
      if (cf?.url) {
        setStatus(
          `Published ${data.pagesWritten ?? ""} page(s) → ${cf.url}`,
        );
      } else if (cf?.error) {
        setStatus(`Generated locally, Cloudflare failed: ${cf.error}`);
      } else {
        setStatus(
          `Published ${data.pagesWritten ?? ""} page(s) → /sites/${data.siteSlug || activeSite.slug}/`,
        );
      }
      setPublishOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setStatus("Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = Boolean(
    activeSite && (localHasChanges || hasCloudflare),
  );

  return (
    <div
      className={[
        "flex h-dvh max-h-dvh flex-col overflow-hidden bg-slate-50",
        isCanvas ? "fixed inset-0 z-30" : "",
      ].join(" ")}
      style={
        {
          ["--admin-header-h" as string]: `${Math.max(headerH, 48)}px`,
        } as React.CSSProperties
      }
    >
      {/* Top bar — always on top of canvas content */}
      <header
        ref={headerRef}
        className="shrink-0 z-[60] flex items-center gap-2 sm:gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm overflow-visible"
      >
        <button
          type="button"
          onClick={toggleNav}
          title={navCollapsed ? "Show navigation" : "Hide navigation"}
          aria-label={navCollapsed ? "Show navigation" : "Hide navigation"}
          aria-expanded={!navCollapsed}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {/* Panel / menu collapse icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {navCollapsed ? (
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d="M13 12h5" />
                <path d="M15.5 9.5 18 12l-2.5 2.5" />
              </>
            ) : (
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d="M14 12H9" />
                <path d="M11.5 9.5 9 12l2.5 2.5" />
              </>
            )}
          </svg>
        </button>

        {/* Site name only outside the page canvas */}
        {!isCanvas && (
          <div className="min-w-0 hidden sm:block">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 leading-none">
              {activeSite ? activeSite.name : "CMSinMotion"}
            </p>
            {activeSite && (
              <p className="text-[11px] text-slate-500 truncate max-w-[10rem]">
                /{activeSite.slug}
              </p>
            )}
          </div>
        )}

        {/* Filterable page selector — dropdown uses fixed positioning so header overflow doesn't clip it */}
        <div
          className={[
            "relative min-w-0 flex-1",
            isCanvas ? "max-w-sm" : "max-w-md",
          ].join(" ")}
          ref={pageMenuRef}
        >
          <label className="sr-only" htmlFor="admin-page-filter">
            Select page
          </label>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 focus-within:ring-1 focus-within:ring-blue-500">
            <span className="pl-2.5 text-[10px] uppercase tracking-wide text-slate-500 shrink-0">
              Page
            </span>
            <input
              id="admin-page-filter"
              type="text"
              autoComplete="off"
              disabled={!activeSite}
              value={
                pageMenuOpen
                  ? pageQuery
                  : currentPage
                    ? currentPage.menuTitle || currentPage.title
                    : pageQuery
              }
              placeholder={
                pages.length ? "Search pages…" : "No pages on this site"
              }
              onFocus={() => {
                setPageMenuOpen(true);
                setPageQuery("");
              }}
              onClick={() => {
                setPageMenuOpen(true);
                setPageQuery("");
              }}
              onChange={(e) => {
                setPageQuery(e.target.value);
                setPageMenuOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setPageMenuOpen(false);
                  setPageQuery("");
                }
                if (e.key === "Enter" && filteredPages[0]) {
                  e.preventDefault();
                  router.push(`/admin/pages/${filteredPages[0].id}`);
                  setPageMenuOpen(false);
                  setPageQuery("");
                }
              }}
              className="w-full min-w-0 bg-transparent px-2 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!activeSite}
              onClick={() => {
                setPageMenuOpen((o) => !o);
                if (!pageMenuOpen) setPageQuery("");
              }}
              className="pr-2 text-slate-400 hover:text-white disabled:opacity-40"
              aria-label="Toggle page list"
              aria-expanded={pageMenuOpen}
            >
              ▾
            </button>
          </div>

          {pageMenuOpen && activeSite && (
            <ul
              className="fixed z-[80] max-h-80 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 py-1 shadow-2xl"
              role="listbox"
              style={{
                top: pageMenuPos.top,
                left: pageMenuPos.left,
                width: pageMenuPos.width,
                maxWidth: "calc(100vw - 1rem)",
              }}
            >
              <li>
                <Link
                  href="/admin/pages"
                  onClick={() => {
                    setPageMenuOpen(false);
                    setPageQuery("");
                  }}
                  className="block px-3 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  All pages…
                </Link>
              </li>
              {pages.length === 0 && (
                <li className="px-3 py-3 text-xs text-slate-500">
                  No pages for this site yet.
                </li>
              )}
              {pages.length > 0 && filteredPages.length === 0 && (
                <li className="px-3 py-3 text-xs text-slate-500">
                  No pages match “{pageQuery}”
                </li>
              )}
              {filteredPages.map((p) => {
                const active = currentPage?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        router.push(`/admin/pages/${p.id}`);
                        setPageMenuOpen(false);
                        setPageQuery("");
                      }}
                      className={[
                        "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-800",
                        active ? "bg-slate-800/80" : "",
                      ].join(" ")}
                    >
                      <span className="text-sm text-white truncate w-full">
                        {p.menuTitle || p.title}
                        {p.isDefault && (
                          <span className="ml-1.5 text-[10px] text-emerald-400">
                            home
                          </span>
                        )}
                        {p.isHidden && (
                          <span className="ml-1.5 text-[10px] text-amber-400">
                            hidden
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono truncate w-full">
                        /{p.slug}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Canvas controls: device + add section + settings + save */}
        {isCanvas && chrome && (
          <div className="flex items-center gap-2 shrink-0">
            {chrome.layoutModeAvailable && chrome.setEditorMode && (
              <div className="flex rounded-lg border border-slate-700 p-0.5 text-[11px]">
                {(
                  [
                    ["content", "Content"],
                    ["layout", "Layout"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => chrome.setEditorMode?.(id as EditorMode)}
                    className={[
                      "rounded-md px-2 py-1 whitespace-nowrap",
                      (chrome.editorMode || "content") === id
                        ? "bg-white text-slate-900"
                        : "text-slate-400 hover:text-white",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex rounded-lg border border-slate-700 p-0.5 text-[11px]">
              {(
                [
                  ["desktop", "Desktop"],
                  ["tablet", "Tablet"],
                  ["phone", "Phone"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => chrome.setDevice(id as CanvasDevice)}
                  className={[
                    "rounded-md px-2 py-1 whitespace-nowrap",
                    chrome.device === id
                      ? "bg-white text-slate-900"
                      : "text-slate-400 hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => chrome.onAddSection?.()}
              className={[
                "rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap",
                chrome.showAdd
                  ? "border-blue-500 bg-blue-600/20 text-blue-200"
                  : "border-slate-600 bg-slate-800 text-white hover:bg-slate-700",
              ].join(" ")}
            >
              + Add section
            </button>
            <button
              type="button"
              onClick={() => chrome.setShowMeta((v) => !v)}
              className={[
                "rounded-lg border px-2.5 py-1.5 text-xs whitespace-nowrap",
                chrome.showMeta
                  ? "border-blue-500 bg-blue-600/20 text-blue-200"
                  : "border-slate-700 text-slate-300 hover:bg-slate-800",
              ].join(" ")}
            >
              Page settings
            </button>
            {chrome.saveStatus && (
              <span
                className={[
                  "text-[11px] hidden sm:inline whitespace-nowrap",
                  chrome.saving
                    ? "text-amber-300/90"
                    : chrome.saveStatus === "Saved"
                      ? "text-emerald-400/90"
                      : "text-slate-400",
                ].join(" ")}
              >
                {chrome.saveStatus}
              </span>
            )}
          </div>
        )}

        {/* Publish menu */}
        <div className="ml-auto relative shrink-0" ref={publishMenuRef}>
          <button
            type="button"
            disabled={!activeSite || publishing}
            onClick={() => setPublishOpen((o) => !o)}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              canPublish
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "border border-slate-700 bg-slate-900 text-slate-400",
              !activeSite || publishing ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title={
              !activeSite
                ? "No active site"
                : localHasChanges
                  ? "There are unpublished changes"
                  : hasCloudflare
                    ? "Redeploy generated site to Cloudflare Pages"
                    : "No changes since last publish"
            }
          >
            {publishing ? "Publishing…" : "Publish"}
            <span className="text-[10px] opacity-80">▾</span>
            {localHasChanges && activeSite && !publishing && (
              <span
                className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-300"
                title="Unpublished changes"
              />
            )}
          </button>

          {publishOpen && activeSite && (
            <PublishModal
              site={{
                id: activeSite.id,
                slug: activeSite.slug,
                domain: activeSite.domain,
                cloudflareProject: activeSite.cloudflareProject,
                cloudflareUrl: activeSite.cloudflareUrl,
              }}
              hasCloudflare={hasCloudflare}
              publishing={publishing}
              canPublish={canPublish}
              onPublish={() => void onPublish()}
            />
          )}
        </div>

        {status && (
          <p className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 max-w-[12rem] truncate hidden xl:block">
            {status}
            {pending ? " · …" : ""}
          </p>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left navigation — slides off screen when collapsed */}
        <aside
          className={[
            "flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-900 text-slate-100 transition-all duration-200 ease-out",
            navCollapsed
              ? "w-0 border-r-0 opacity-0 pointer-events-none"
              : "w-60 opacity-100",
          ].join(" ")}
          aria-hidden={navCollapsed}
        >
          <div className="px-5 py-4 border-b border-slate-800 min-w-[15rem]">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              CMSinMotion
            </p>
            <p className="font-semibold truncate">
              {activeSite?.name || "Admin"}
            </p>
            {activeSite && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                /{activeSite.slug} · {activeSite.cssFramework}
              </p>
            )}
          </div>
          <nav className="flex-1 p-3 space-y-1 min-w-[15rem] overflow-y-auto">
            {nav.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href ||
                    pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "block rounded-lg px-3 py-2 text-sm",
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-slate-800 text-sm min-w-[15rem]">
            <p className="text-slate-300 truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-600 mt-0.5">
              {user.role}
            </p>
            <button
              type="button"
              onClick={() => {
                void fetch("/api/auth/logout", { method: "POST" }).then(() => {
                  window.location.href = "/login";
                });
              }}
              className="mt-3 text-xs text-slate-400 hover:text-white underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main
          className={[
            "flex-1 min-w-0 min-h-0",
            isCanvas ? "overflow-hidden relative" : "overflow-auto",
          ].join(" ")}
        >
          {isCanvas ? (
            <div className="absolute inset-0 overflow-hidden">{children}</div>
          ) : (
            <div className="admin-main mx-auto max-w-5xl px-6 py-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

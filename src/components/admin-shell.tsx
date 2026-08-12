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
import { useEditorChrome, type CanvasDevice } from "@/components/editor-chrome-context";

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
  } | null;
  pages: AdminPageOption[];
  hasUnpublishedChanges: boolean;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
};

const NAV_COLLAPSED_KEY = "cms_admin_nav_collapsed";

export function AdminShell({
  user,
  activeSite,
  pages,
  hasUnpublishedChanges,
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

  // Close menus on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (pageMenuRef.current && !pageMenuRef.current.contains(t)) {
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
    if (!activeSite || !localHasChanges || publishing) return;
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
      setStatus(
        `Published ${data.pagesWritten ?? ""} page(s) → /sites/${data.siteSlug || activeSite.slug}/`,
      );
      setPublishOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setStatus("Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const liveHref = activeSite ? `/s/${activeSite.slug}/` : null;
  const publishedHref = activeSite ? `/sites/${activeSite.slug}` : null;
  const hasPublished = Boolean(activeSite?.lastGeneratedAt);

  return (
    <div
      className={[
        "flex flex-col bg-slate-50",
        isCanvas
          ? "fixed inset-0 z-30 h-[100dvh] max-h-[100dvh] overflow-hidden"
          : "min-h-screen",
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
        className="shrink-0 z-[60] flex items-center gap-2 sm:gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 text-sm overflow-x-auto"
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

        {/* Filterable page selector */}
        <div
          className={[
            "relative min-w-0 flex-1",
            isCanvas ? "max-w-xs" : "max-w-md",
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
              type="search"
              autoComplete="off"
              disabled={!activeSite || pages.length === 0}
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
              onClick={() => setPageMenuOpen((o) => !o)}
              className="pr-2 text-slate-400 hover:text-white disabled:opacity-40"
              aria-label="Toggle page list"
            >
              ▾
            </button>
          </div>

          {pageMenuOpen && activeSite && (
            <ul
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl"
              role="listbox"
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
              {filteredPages.length === 0 && (
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
              className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 whitespace-nowrap"
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
              {chrome.showMeta ? "Hide settings" : "Page settings"}
            </button>
            <button
              type="button"
              disabled={chrome.saving}
              onClick={() => chrome.onSave()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60 whitespace-nowrap"
            >
              {chrome.saving ? "Saving…" : "Save page"}
            </button>
            {chrome.saveStatus && (
              <span className="text-[11px] text-slate-400 hidden lg:inline whitespace-nowrap">
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
              localHasChanges && activeSite
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "border border-slate-700 bg-slate-900 text-slate-400",
              !activeSite || publishing ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title={
              !activeSite
                ? "No active site"
                : localHasChanges
                  ? "There are unpublished changes"
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
            <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
              <button
                type="button"
                disabled={!localHasChanges || publishing}
                onClick={() => void onPublish()}
                className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="text-sm font-medium text-white">
                  Publish site
                </span>
                <span className="text-[11px] text-slate-500">
                  {localHasChanges
                    ? "Generate static HTML from current content"
                    : "Already up to date — no changes since last publish"}
                </span>
              </button>
              <div className="my-1 border-t border-slate-800" />
              <a
                href={liveHref || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-slate-800"
                onClick={() => setPublishOpen(false)}
              >
                <span className="text-sm font-medium text-slate-200">
                  View live preview ↗
                </span>
                <span className="text-[11px] text-slate-500">
                  Dynamic preview (/s/{activeSite.slug})
                </span>
              </a>
              <a
                href={
                  hasPublished && publishedHref
                    ? publishedHref
                    : liveHref || "#"
                }
                target="_blank"
                rel="noreferrer"
                className={[
                  "flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-slate-800",
                  !hasPublished ? "opacity-60" : "",
                ].join(" ")}
                onClick={() => setPublishOpen(false)}
                title={
                  hasPublished
                    ? "Open last published static site"
                    : "Publish once to generate static files"
                }
              >
                <span className="text-sm font-medium text-slate-200">
                  View published site ↗
                </span>
                <span className="text-[11px] text-slate-500">
                  {hasPublished
                    ? `Static files · last ${new Date(activeSite.lastGeneratedAt!).toLocaleString()}`
                    : "Not published yet"}
                </span>
              </a>
            </div>
          )}
        </div>

        {status && (
          <p className="text-[11px] text-slate-400 whitespace-nowrap shrink-0 max-w-[12rem] truncate hidden xl:block">
            {status}
            {pending ? " · …" : ""}
          </p>
        )}
      </header>

      <div className="flex flex-1 min-h-0 h-0 relative overflow-hidden">
        {/* Left navigation — slides off screen when collapsed */}
        <aside
          className={[
            "shrink-0 border-r border-slate-200 bg-slate-900 text-slate-100 flex flex-col transition-all duration-200 ease-out overflow-hidden h-full",
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

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectSiteStack,
  extractDocumentHead,
  isWordpressInstall,
  sanitizeCloneBodyClass,
} from "./scrape-page";
import { distinctAfterContent } from "./html-split";

describe("detectSiteStack", () => {
  it("does not treat the word WordPress in copy as a WP install", () => {
    const html = `
      <html><body>
        <p>We support any no-code platform (Webflow, WordPress, you name it!)</p>
        <link rel=stylesheet href=/static/css/app.css>
        <link rel="modulepreload" href="/static/js/Home.js">
      </body></html>`;
    assert.equal(isWordpressInstall(html), false);
    assert.equal(detectSiteStack(html).builder, "vite");
  });

  it("still detects Webflow from w-mod classes, not the word Webflow", () => {
    assert.equal(
      detectSiteStack(`<html class="w-mod-js"><body>Hello</body></html>`).builder,
      "webflow",
    );
    assert.equal(
      detectSiteStack(`<html data-wf-site="abc" lang="en"><body></body></html>`).builder,
      "webflow",
    );
    assert.notEqual(
      detectSiteStack(`<p>Built on Webflow</p>`).builder,
      "webflow",
    );
  });

  it("does not treat Webflow navbar-container as Bootstrap", () => {
    const html = `<div class="navbar-container sticky-top"></div>`;
    assert.equal(detectSiteStack(html).cssKind, "custom");
  });

  it("still detects a real WordPress theme path", () => {
    const html = `<link rel="stylesheet" href="https://ex.com/wp-content/themes/x/style.css">`;
    assert.equal(isWordpressInstall(html), true);
    assert.equal(detectSiteStack(html).builder, "wordpress");
  });

  it("still detects Divi before the generic WP path", () => {
    const html = `<body class="et_divi_theme"><div class="et_pb_section"></div>
      <link href="/wp-content/themes/divi/style.css">`;
    assert.equal(detectSiteStack(html).builder, "divi");
  });

  it("still detects Gutenberg blocks", () => {
    const html = `<div class="wp-block-group"><div class="wp-block-cover"></div></div>`;
    assert.equal(detectSiteStack(html).builder, "gutenberg");
  });

  it("does not treat a Squarespace logo asset as a Squarespace site", () => {
    const html = `<img src="https://cdn.example.com/integrations/squarespace-logo-horizontal-black.jpeg">
      <link rel=stylesheet href=/static/css/app.css>
      <link rel="modulepreload" href="/x.js">`;
    assert.equal(detectSiteStack(html).builder, "vite");
  });

  it("does not mark compiled Tailwind as cssKind tailwind (no Play CDN)", () => {
    const html = `<body class="flex min-h-screen bg-white dark:bg-gray-900"></body>`;
    assert.equal(detectSiteStack(html).cssKind, "custom");
  });
});

describe("extractDocumentHead", () => {
  it("reads a normal <head>", () => {
    const html = `<!doctype html><html><head><link rel="stylesheet" href="/a.css"></head><body>Hi</body></html>`;
    assert.match(extractDocumentHead(html), /a\.css/);
  });

  it("does not treat <header> as <head>", () => {
    const html = `<!doctype html><html lang="en"><link rel=stylesheet href=/static/css/x.css><body><header class="site">Nav</header></body></html>`;
    const head = extractDocumentHead(html);
    assert.match(head, /static\/css\/x\.css/);
    assert.doesNotMatch(head, /<header/);
  });
});

describe("sanitizeCloneBodyClass", () => {
  it("keeps Tailwind variant classes", () => {
    const raw = `antialiased bg-white dark:bg-gray-900 dark:text-gray-100 font-inter`;
    const out = sanitizeCloneBodyClass(raw);
    assert.match(out, /dark:bg-gray-900/);
    assert.match(out, /dark:text-gray-100/);
    assert.doesNotMatch(out, /darkbg-gray/);
  });
});

describe("rewriteStylesheetHrefs", () => {
  it("drops integrity when pointing at a local clone.css", async () => {
    const { rewriteStylesheetHrefs } = await import("./clone-from-url");
    const head = `<link href="https://cdn.example.com/app.css" rel="stylesheet" integrity="sha384-abc" crossorigin="anonymous"/>`;
    const out = rewriteStylesheetHrefs(
      head,
      new Map([["https://cdn.example.com/app.css", "/uploads/x/clone.css"]]),
    );
    assert.match(out, /href="\/uploads\/x\/clone\.css"/);
    assert.doesNotMatch(out, /integrity/);
    assert.doesNotMatch(out, /crossorigin/);
  });
});

describe("distinctAfterContent", () => {
  it("drops after-content that is the footer again", () => {
    const footer = `<footer><p>Acme Inc</p></footer>`;
    assert.equal(distinctAfterContent(footer, footer), "");
  });

  it("keeps a real after-article panel", () => {
    const footer = `<footer><p>Acme Inc</p></footer>`;
    const after = `<div id="author-panel"><p>About the author Jane</p></div>`;
    assert.equal(distinctAfterContent(after, footer), after);
  });
});

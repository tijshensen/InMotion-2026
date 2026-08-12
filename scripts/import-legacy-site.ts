/**
 * Import Kinderdagverblijf Kiekeboe from the legacy MotionCMS dump
 * using the original section-based model:
 *   Template → TemplateBlocks (preformatted HTML sections)
 *   Page → PageBlocks (instances with field JSON values)
 *
 * Usage: npx tsx scripts/import-legacy-site.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { TAILWIND_SHELL } from "../src/lib/bootstrap-to-tailwind";
import { normalizeInsertHtml } from "../src/lib/insert-html";
import {
  emptyFieldsFromTemplate,
  META,
  parseSectionFields,
  serializeFields,
} from "../src/lib/sections";

const prisma = new PrismaClient();

const DUMP =
  process.env.LEGACY_SQL ||
  path.join(
    process.env.HOME || "",
    "Projects/cmsinmotion2/cmsinmotion_kinderdagverblijfkiekeboe.sql",
  );

/** Latest template set for Kiekeboe in the dump */
const LEGACY_TEMPLATE_SET_ID = 67;

function extractTableInserts(sql: string, table: string): string[] {
  const out: string[] = [];
  let idx = 0;
  while (true) {
    const start = sql.indexOf(`INSERT INTO \`${table}\``, idx);
    if (start < 0) break;
    let i = start;
    let inStr = false;
    let end = -1;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (inStr) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (c === "'" && sql[i + 1] === "'") {
          i++;
          continue;
        }
        if (c === "'") inStr = false;
        continue;
      }
      if (c === "'") {
        inStr = true;
        continue;
      }
      if (c === ";") {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    out.push(sql.slice(start, end));
    idx = end + 1;
  }
  return out;
}

function parseValues(insertSql: string): Record<string, unknown>[] {
  const colsMatch = insertSql.match(
    /INSERT INTO `[^`]+` \(([^)]+)\) VALUES/i,
  );
  if (!colsMatch) return [];
  const cols = colsMatch[1].split(",").map((s) => s.trim().replace(/`/g, ""));
  const valuesPart = insertSql.slice(insertSql.indexOf("VALUES") + 6);
  const rows: unknown[][] = [];
  let i = 0;
  while (i < valuesPart.length) {
    while (i < valuesPart.length && /[\s,]/.test(valuesPart[i])) i++;
    if (i >= valuesPart.length) break;
    if (valuesPart[i] !== "(") {
      i++;
      continue;
    }
    i++;
    const row: unknown[] = [];
    while (i < valuesPart.length) {
      while (i < valuesPart.length && /\s/.test(valuesPart[i])) i++;
      if (valuesPart[i] === ")") {
        i++;
        break;
      }
      if (valuesPart[i] === ",") {
        i++;
        continue;
      }
      if (
        valuesPart.slice(i, i + 4).toUpperCase() === "NULL" &&
        /[\s,)]/.test(valuesPart[i + 4] || ")")
      ) {
        row.push(null);
        i += 4;
        continue;
      }
      if (/[-0-9.]/.test(valuesPart[i]) && valuesPart[i] !== "'") {
        let j = i;
        while (j < valuesPart.length && /[-0-9.eE+]/.test(valuesPart[j])) j++;
        row.push(Number(valuesPart.slice(i, j)));
        i = j;
        continue;
      }
      if (valuesPart[i] === "'") {
        i++;
        let s = "";
        while (i < valuesPart.length) {
          if (valuesPart[i] === "\\") {
            const esc = valuesPart[i + 1];
            if (esc === "n") s += "\n";
            else if (esc === "t") s += "\t";
            else if (esc === "r") s += "\r";
            else if (esc === "\\") s += "\\";
            else if (esc === "'") s += "'";
            else if (esc === '"') s += '"';
            else s += esc ?? "";
            i += 2;
            continue;
          }
          if (valuesPart[i] === "'" && valuesPart[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          if (valuesPart[i] === "'") {
            i++;
            break;
          }
          s += valuesPart[i++];
        }
        row.push(s);
        continue;
      }
      i++;
    }
    if (row.length) rows.push(row);
  }
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, idx) => {
      o[c] = r[idx];
    });
    return o;
  });
}

function slugify(input: string, fallback: string) {
  const base = (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || fallback;
}

/**
 * Map legacy page_block.content JSON array to {v:1,fields}.
 * Array items look like:
 *   { name: "<sha1>", value: "…" }
 *   { name: "<sha1>_link", value: "#internalURI194" | "https://…" }
 *   { name: "<sha1>_link", value: "…", value_target?, value_title? }
 *   { name: "<sha1>_alt", value: "…" }
 */
/**
 * Legacy Templater processes fields by type, not DOM order:
 *   singleline → multiline → image → file
 * Content arrays follow that order (with *_link / *_alt entries after their field).
 */
function defsInLegacySaveOrder(templateHtml: string) {
  const defs = parseSectionFields(templateHtml);
  const order = ["singleline", "multiline", "image", "file"] as const;
  return order.flatMap((t) => defs.filter((d) => d.type === t));
}

function mapLegacyFields(
  templateHtml: string,
  contentRaw: unknown,
): string {
  const defs = defsInLegacySaveOrder(templateHtml);
  const fields = emptyFieldsFromTemplate(templateHtml);
  const raw = String(contentRaw ?? "").trim();
  if (!raw || raw === "{}" || raw === "[]") {
    return serializeFields(fields);
  }
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      type LegacyItem = {
        name?: string;
        value?: string;
        value_target?: string;
        value_title?: string;
      };
      const items = data as LegacyItem[];
      const byName = new Map<string, LegacyItem>();
      for (const item of items) {
        if (item?.name) byName.set(String(item.name), item);
      }

      const isMeta = (name: string) =>
        /_(link|link_target|link_title|alt)$/i.test(name);

      // Primary field values in legacy save order
      const primaries = items.filter(
        (item) => item?.name && !isMeta(String(item.name)),
      );

      primaries.forEach((item, idx) => {
        const def = defs[idx];
        if (!def) return;
        let value = String(item.value ?? "");
        // Strip leftover XML wrappers from multiline
        value = value
          .replace(/<\?xml[^?]*\?>\s*/gi, "")
          .replace(/^<\/?multiline[^>]*>/i, "")
          .replace(/<\/multiline>\s*$/i, "")
          .trim();
        fields[def.key] = value;

        const base = String(item.name);
        const linkItem =
          byName.get(base + "_link") || byName.get(base + "_Link");
        if (linkItem?.value) {
          fields[def.key + META.link] = String(linkItem.value);
          const target =
            linkItem.value_target ||
            byName.get(base + "_link_target")?.value ||
            "";
          const title =
            linkItem.value_title ||
            byName.get(base + "_link_title")?.value ||
            "";
          if (target) fields[def.key + META.linkTarget] = String(target);
          if (title) fields[def.key + META.linkTitle] = String(title);
        }
        const altItem = byName.get(base + "_alt");
        if (altItem?.value) {
          fields[def.key + META.alt] = String(altItem.value);
        }
      });
      return serializeFields(fields);
    }
  } catch {
    // ignore
  }
  return serializeFields(fields);
}

const SHELL = TAILWIND_SHELL;

async function main() {
  if (!fs.existsSync(DUMP)) throw new Error(`Dump not found: ${DUMP}`);

  console.log("Reading dump…");
  const sql = fs.readFileSync(DUMP, "utf8");
  const pages = extractTableInserts(sql, "page").flatMap(parseValues);
  const pageBlocks = extractTableInserts(sql, "page_block").flatMap(parseValues);
  const templates = extractTableInserts(sql, "template").flatMap(parseValues);
  const templateBlocks = extractTableInserts(sql, "template_block").flatMap(
    parseValues,
  );
  const inserts = extractTableInserts(sql, "inserts").flatMap(parseValues);
  const settings = extractTableInserts(sql, "settings").flatMap(parseValues);

  // Prefer latest set (67) templates: 275, 276, 277
  const setTemplates = templates.filter(
    (t) => Number(t.template_set_id) === LEGACY_TEMPLATE_SET_ID,
  );
  const setTemplateIds = new Set(setTemplates.map((t) => Number(t.id)));
  // Also include any template referenced by pages
  const usedTemplateIds = new Set(pages.map((p) => Number(p.template_id)));
  const importTemplates = templates.filter(
    (t) =>
      setTemplateIds.has(Number(t.id)) || usedTemplateIds.has(Number(t.id)),
  );

  console.log(
    `Pages ${pages.length}, page_blocks ${pageBlocks.length}, templates ${importTemplates.length}, template_blocks ${templateBlocks.length}`,
  );

  const siteTitle = String(
    settings[0]?.siteTitle || "Kinderdagverblijf Kiekeboe",
  );
  const siteSlug = "kiekeboe";

  const existing = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (existing) {
    console.log("Removing previous kiekeboe import…");
    await prisma.site.delete({ where: { id: existing.id } });
  }

  const admin = await prisma.user.findFirst({ where: { role: "SUPERADMIN" } });
  if (!admin) throw new Error("Run npm run db:seed first (need SUPERADMIN)");

  const site = await prisma.site.create({
    data: {
      name: siteTitle,
      slug: siteSlug,
      siteTitle,
      domain: "kinderdagverblijfkiekeboe.nl",
      members: { create: { userId: admin.id, role: "SUPERADMIN" } },
      languages: {
        create: {
          name: "Nederlands",
          code: "nl",
          isDefault: true,
          siteTitle,
        },
      },
      settings: {
        create: [
          { key: "legacyImport", value: "section-builder" },
          { key: "legacyTemplateSet", value: String(LEGACY_TEMPLATE_SET_ID) },
        ],
      },
    },
    include: { languages: true },
  });
  const language = site.languages[0];

  const templateSet = await prisma.templateSet.create({
    data: {
      siteId: site.id,
      name: "Kiekeboe (legacy set 67)",
    },
  });

  // Map old template id → new template id
  const templateIdMap = new Map<number, string>();
  // Map old template_block id → new template_block id
  const blockTypeIdMap = new Map<number, string>();
  // Map old template_block id → defaultHtml
  const blockHtmlByOldId = new Map<number, string>();

  for (const t of importTemplates) {
    const oldId = Number(t.id);
    const created = await prisma.template.create({
      data: {
        templateSetId: templateSet.id,
        name: String(t.name || `Template ${oldId}`),
        // Use simplified shell; sections carry the real layout
        coreHtml: SHELL,
        menuHtml: String(t.menu || ""),
        submenuHtml: String(t.submenu || ""),
      },
    });
    templateIdMap.set(oldId, created.id);

    const tbs = templateBlocks
      .filter((b) => Number(b.template_id) === oldId)
      .sort((a, b) => Number(a.id) - Number(b.id));

    let order = 0;
    for (const tb of tbs) {
      // Repair legacy SQL escape loss only — keep Bootstrap classes for legacy themes
      const html = normalizeInsertHtml(String(tb.content || tb.original || ""));
      const nb = await prisma.templateBlock.create({
        data: {
          templateId: created.id,
          name: String(tb.name || `Section ${tb.id}`),
          defaultHtml: html,
          isRepeatable: Boolean(Number(tb.repeatable)),
          sortOrder: order++,
        },
      });
      blockTypeIdMap.set(Number(tb.id), nb.id);
      blockHtmlByOldId.set(Number(tb.id), html);
    }
    console.log(
      `  template ${t.name}: ${tbs.length} section types`,
    );
  }

  // Fallback template if a page references missing template
  let fallbackTemplateId = [...templateIdMap.values()][0];
  if (!fallbackTemplateId) {
    const fb = await prisma.template.create({
      data: {
        templateSetId: templateSet.id,
        name: "Fallback",
        coreHtml: SHELL,
        blocks: {
          create: {
            name: "Content",
            defaultHtml:
              '<div class="section"><h1><singleline name="Title">Title</singleline></h1><div><multiline name="Body"><p>Content</p></multiline></div></div>',
            sortOrder: 0,
          },
        },
      },
      include: { blocks: true },
    });
    fallbackTemplateId = fb.id;
  }

  // Inserts
  for (const ins of inserts) {
    const tag = String(ins.tag || "")
      .replace(/^\{\{|\}\}$/g, "")
      .trim()
      .slice(0, 80);
    if (!tag) continue;
    try {
      await prisma.insert.create({
        data: {
          siteId: site.id,
          tag,
          content: String(ins.content || ""),
          onlyInRender: Boolean(ins.onlyInRender),
        },
      });
    } catch {
      /* dup */
    }
  }
  await prisma.insert.upsert({
    where: { siteId_tag: { siteId: site.id, tag: "footer" } },
    update: {},
    create: {
      siteId: site.id,
      tag: "footer",
      content: `© ${siteTitle}`,
    },
  });

  // Group page blocks
  const blocksByPage = new Map<number, Record<string, unknown>[]>();
  for (const b of pageBlocks) {
    const pid = Number(b.page_id);
    if (!blocksByPage.has(pid)) blocksByPage.set(pid, []);
    blocksByPage.get(pid)!.push(b);
  }
  for (const list of blocksByPage.values()) {
    list.sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
  }

  const pageList = pages
    .map((p) => ({
      oldId: Number(p.id),
      title: String(p.title || "").trim() || `Page ${p.id}`,
      prio: Number(p.prio ?? 0),
      parentOld: Number(p.parent_id || 0) || null,
      templateOld: Number(p.template_id || 0),
      isDefault: Boolean(Number(p.isDefault)),
      isHidden: Boolean(Number(p.isHidden)),
      slugRaw: String(p.page_seo_name || "").trim(),
      meta: String(p.meta_description || ""),
      menuTitle: String(p.menu_title || "").trim(),
    }))
    .filter((p) => p.oldId);

  const byOld = new Map(pageList.map((p) => [p.oldId, p]));
  const ordered: typeof pageList = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function visit(id: number) {
    if (visited.has(id) || !byOld.has(id)) return;
    if (visiting.has(id)) return;
    visiting.add(id);
    const p = byOld.get(id)!;
    if (p.parentOld) visit(p.parentOld);
    visiting.delete(id);
    visited.add(id);
    ordered.push(p);
  }
  for (const p of pageList) visit(p.oldId);

  const usedSlugs = new Set<string>();
  const pageIdMap = new Map<number, string>();
  let created = 0;

  for (const p of ordered) {
    let slug = slugify(p.slugRaw || p.menuTitle || p.title, `page-${p.oldId}`);
    let candidate = slug;
    let n = 2;
    while (usedSlugs.has(candidate)) candidate = `${slug}-${n++}`;
    slug = candidate;
    usedSlugs.add(slug);

    const templateId =
      templateIdMap.get(p.templateOld) || fallbackTemplateId;

    const parentId =
      p.parentOld && pageIdMap.has(p.parentOld)
        ? pageIdMap.get(p.parentOld)!
        : null;

    const legacyBlocks = blocksByPage.get(p.oldId) || [];

    const page = await prisma.page.create({
      data: {
        siteId: site.id,
        languageId: language.id,
        templateId,
        authorId: admin.id,
        parentId,
        title: p.title.slice(0, 500),
        menuTitle: (p.menuTitle || p.title).slice(0, 200),
        slug,
        metaDescription: p.meta.slice(0, 2000),
        isDefault: p.isDefault,
        isHidden: p.isHidden,
        inMenu: !p.isHidden,
        sortOrder: p.prio || created,
        legacyId: p.oldId,
      },
    });
    pageIdMap.set(p.oldId, page.id);

    let sort = 0;
    for (const lb of legacyBlocks) {
      const oldTbId = Number(lb.template_block_id);
      const newTbId = blockTypeIdMap.get(oldTbId);
      if (!newTbId) continue;
      const html = blockHtmlByOldId.get(oldTbId) || "";
      const content = mapLegacyFields(html, lb.content);
      await prisma.pageBlock.create({
        data: {
          pageId: page.id,
          templateBlockId: newTbId,
          content,
          css: String(lb.css || ""),
          sortOrder: sort++,
          isHidden: Boolean(Number(lb.hidden)),
        },
      });
    }

    // If page has zero sections, add a default "Alleen tekst" or first block type
    if (sort === 0) {
      const anyTb = await prisma.templateBlock.findFirst({
        where: { templateId },
        orderBy: { sortOrder: "asc" },
      });
      if (anyTb) {
        await prisma.pageBlock.create({
          data: {
            pageId: page.id,
            templateBlockId: anyTb.id,
            content: serializeFields(
              emptyFieldsFromTemplate(anyTb.defaultHtml),
            ),
            sortOrder: 0,
          },
        });
      }
    }

    created++;
    if (created % 25 === 0) console.log(`  … ${created} pages`);
  }

  const defaults = await prisma.page.count({
    where: { siteId: site.id, isDefault: true },
  });
  if (defaults === 0) {
    const home =
      (await prisma.page.findFirst({
        where: { siteId: site.id, slug: "home" },
      })) ||
      (await prisma.page.findFirst({
        where: { siteId: site.id },
        orderBy: { sortOrder: "asc" },
      }));
    if (home) {
      await prisma.page.update({
        where: { id: home.id },
        data: { isDefault: true, isHidden: false, inMenu: true },
      });
    }
  }

  const withSections = await prisma.pageBlock.groupBy({
    by: ["pageId"],
    where: { page: { siteId: site.id } },
    _count: true,
  });

  console.log("\nImport complete (section builder model)");
  console.log(`  Site: ${site.name} (/s/${site.slug})`);
  console.log(`  Pages: ${created}`);
  console.log(`  Pages with sections: ${withSections.length}`);
  console.log(`  Section types: ${blockTypeIdMap.size}`);
  console.log(`  Admin: http://localhost:3000/admin/pages`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

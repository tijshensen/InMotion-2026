/**
 * 1. Set Page.legacyId from the legacy SQL dump (match by page_seo_name / slug).
 * 2. Re-map page_block field links (_link / _alt) from dump content arrays.
 *
 *   npx tsx scripts/fix-internal-links.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  emptyFieldsFromTemplate,
  META,
  parseSectionFields,
  serializeFields,
} from "../src/lib/sections";
import { normalizeInsertHtml } from "../src/lib/insert-html";

const prisma = new PrismaClient();

const DUMP =
  process.env.LEGACY_SQL ||
  path.join(
    process.env.HOME || "",
    "Projects/cmsinmotion2/cmsinmotion_kinderdagverblijfkiekeboe.sql",
  );

function extractTableInserts(sql: string, table: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `INSERT INTO \`${table}\` \\([^)]+\\) VALUES`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const start = m.index;
    let i = m.index + m[0].length;
    let inStr = false;
    let end = -1;
    for (; i < sql.length; i++) {
      const c = sql[i];
      if (c === "\\" && inStr) {
        i++;
        continue;
      }
      if (c === "'") {
        inStr = !inStr;
        continue;
      }
      if (!inStr && c === ";") {
        end = i;
        break;
      }
    }
    if (end > start) out.push(sql.slice(start, end));
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
      if (valuesPart[i] === "'") {
        i++;
        let s = "";
        while (i < valuesPart.length) {
          if (valuesPart[i] === "\\" && valuesPart[i + 1]) {
            const n = valuesPart[i + 1];
            if (n === "n") s += "\n";
            else if (n === "r") s += "\r";
            else if (n === "t") s += "\t";
            else s += n;
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
      // number
      let num = "";
      while (i < valuesPart.length && /[0-9.-]/.test(valuesPart[i])) {
        num += valuesPart[i++];
      }
      if (num) row.push(Number(num));
      else i++;
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

/** Legacy save order: singleline → multiline → image → file (not DOM order). */
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
    if (!Array.isArray(data)) return serializeFields(fields);

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
    const primaries = items.filter(
      (item) => item?.name && !isMeta(String(item.name)),
    );

    primaries.forEach((item, idx) => {
      const def = defs[idx];
      if (!def) return;
      let value = String(item.value ?? "");
      value = value
        .replace(/<\?xml[^?]*\?>\s*/gi, "")
        .replace(/^<\/?multiline[^>]*>/i, "")
        .replace(/<\/multiline>\s*$/i, "")
        .trim();
      fields[def.key] = value;

      const base = String(item.name);
      const linkItem = byName.get(base + "_link");
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
  } catch {
    return serializeFields(fields);
  }
}

async function main() {
  if (!fs.existsSync(DUMP)) throw new Error(`Dump not found: ${DUMP}`);
  console.log("Reading", DUMP);
  const sql = fs.readFileSync(DUMP, "utf8");

  const legacyPages = extractTableInserts(sql, "page").flatMap(parseValues);
  const legacyBlocks = extractTableInserts(sql, "page_block").flatMap(
    parseValues,
  );

  const site = await prisma.site.findUnique({ where: { slug: "kiekeboe" } });
  if (!site) throw new Error("Site kiekeboe not found");

  const pages = await prisma.page.findMany({ where: { siteId: site.id } });
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));

  let legacySet = 0;
  const oldToNew = new Map<number, string>();

  for (const lp of legacyPages) {
    const oldId = Number(lp.id);
    if (!oldId) continue;
    const seo = String(lp.page_seo_name || "").trim();
    const slug = slugify(seo || String(lp.menu_title || lp.title || ""), `page-${oldId}`);
    let page =
      bySlug.get(slug) ||
      bySlug.get(seo) ||
      byTitle.get(String(lp.title || "").toLowerCase());

    // fuzzy: slug starts with
    if (!page) {
      page = pages.find(
        (p) =>
          p.slug === slug ||
          p.slug.startsWith(slug + "-") ||
          slug.startsWith(p.slug),
      );
    }

    if (page) {
      oldToNew.set(oldId, page.id);
      if (page.legacyId !== oldId) {
        await prisma.page.update({
          where: { id: page.id },
          data: { legacyId: oldId },
        });
        legacySet++;
      } else {
        legacySet++; // already set
      }
    }
  }
  console.log(
    `legacyId mapped: ${oldToNew.size} pages (updated this run when missing)`,
  );

  // Map old template_block.id → new templateBlock.id via name (+ sort)
  const legacyTbs = extractTableInserts(sql, "template_block").flatMap(
    parseValues,
  );
  const newTbs = await prisma.templateBlock.findMany({
    include: { template: true },
  });
  // name → list of new tbs
  const newTbByName = new Map<string, typeof newTbs>();
  for (const tb of newTbs) {
    const k = tb.name.toLowerCase();
    if (!newTbByName.has(k)) newTbByName.set(k, []);
    newTbByName.get(k)!.push(tb);
  }
  const oldTbToNew = new Map<number, string>();
  for (const ltb of legacyTbs) {
    const oldId = Number(ltb.id);
    const name = String(ltb.name || "").toLowerCase();
    const candidates = newTbByName.get(name) || [];
    if (candidates.length === 1) {
      oldTbToNew.set(oldId, candidates[0].id);
    } else if (candidates.length > 1) {
      // pick first unused-ish by id order
      oldTbToNew.set(oldId, candidates[0].id);
    }
  }
  console.log(`template_block id map: ${oldTbToNew.size}`);

  let contentFixed = 0;
  let linkFields = 0;

  // old page_id → blocks
  const blocksByOldPage = new Map<number, Record<string, unknown>[]>();
  for (const b of legacyBlocks) {
    const pid = Number(b.page_id);
    if (!blocksByOldPage.has(pid)) blocksByOldPage.set(pid, []);
    blocksByOldPage.get(pid)!.push(b);
  }

  for (const page of pages) {
    const legacyId = page.legacyId;
    if (legacyId == null) continue;
    const oldBlocks = blocksByOldPage.get(legacyId) || [];
    if (!oldBlocks.length) continue;

    const current = await prisma.pageBlock.findMany({
      where: { pageId: page.id },
      orderBy: { sortOrder: "asc" },
      include: { templateBlock: true },
    });

    // Track which current blocks already consumed (repeatable sections)
    const usedCurrent = new Set<string>();

    for (const old of oldBlocks) {
      const oldTbId = Number(old.template_block_id);
      const newTbId = oldTbToNew.get(oldTbId);
      if (!newTbId) continue;

      const cur = current.find(
        (c) => c.templateBlockId === newTbId && !usedCurrent.has(c.id),
      );
      if (!cur) continue;
      usedCurrent.add(cur.id);

      const html = cur.templateBlock?.defaultHtml || "";
      const next = mapLegacyFields(html, old.content);
      try {
        const nextObj = JSON.parse(next);
        const nextLinks = Object.entries(nextObj.fields || {}).filter(
          ([k, v]) => k.endsWith("__link") && v,
        );
        if (next !== cur.content) {
          await prisma.pageBlock.update({
            where: { id: cur.id },
            data: { content: next },
          });
          contentFixed++;
          linkFields += nextLinks.length;
        }
      } catch {
        /* skip */
      }
    }
  }

  console.log(
    `page blocks re-mapped with links: ${contentFixed} (link fields total ~${linkFields})`,
  );

  // Spot-check internalURI still in content
  const withUri = await prisma.pageBlock.count({
    where: { content: { contains: "internalURI" } },
  });
  const withFieldLink = await prisma.pageBlock.findMany({
    where: { content: { contains: "__link" } },
    take: 5,
  });
  console.log("blocks still containing #internalURI in content:", withUri);
  for (const b of withFieldLink) {
    const d = JSON.parse(b.content);
    const links = Object.entries(d.fields || {}).filter(
      ([k, v]) => k.endsWith("__link") && v,
    );
    if (links.length) console.log(" sample field links", links);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

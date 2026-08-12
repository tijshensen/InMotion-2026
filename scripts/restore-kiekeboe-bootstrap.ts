/**
 * Restore original Bootstrap section HTML + template cores for Kiekeboe
 * from the MotionCMS SQL dump (undo accidental Tailwind class conversion).
 *
 *   npx tsx scripts/restore-kiekeboe-bootstrap.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { normalizeInsertHtml } from "../src/lib/insert-html";
import { normalizeLegacyTemplateCore } from "../src/lib/theme";
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
const LEGACY_SET_ID = 67;

function extractTableInserts(sql: string, table: string): string[] {
  const out: string[] = [];
  const re2 = new RegExp(`INSERT INTO \`${table}\` \\([^)]+\\) VALUES`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re2.exec(sql))) {
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
    if (end > 0) out.push(sql.slice(m.index, end));
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

/** Only fix n/r corruption — never Bootstrap→Tailwind. */
function cleanLegacyHtml(raw: string): string {
  return normalizeInsertHtml(raw || "");
}

function defsInLegacySaveOrder(templateHtml: string) {
  const defs = parseSectionFields(templateHtml);
  const order = ["singleline", "multiline", "image", "file"] as const;
  return order.flatMap((t) => defs.filter((d) => d.type === t));
}

function mapLegacyFields(templateHtml: string, contentRaw: unknown): string {
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
      if (altItem?.value) fields[def.key + META.alt] = String(altItem.value);
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

  const site = await prisma.site.findUnique({ where: { slug: "kiekeboe" } });
  if (!site) throw new Error("kiekeboe site not found");

  await prisma.site.update({
    where: { id: site.id },
    data: { cssFramework: "bootstrap", themeSlug: "kiekeboe" },
  });

  const legacyTemplates = extractTableInserts(sql, "template").flatMap(
    parseValues,
  );
  const legacyBlocks = extractTableInserts(sql, "template_block").flatMap(
    parseValues,
  );
  const legacyPageBlocks = extractTableInserts(sql, "page_block").flatMap(
    parseValues,
  );
  const legacyPages = extractTableInserts(sql, "page").flatMap(parseValues);

  const setTemplates = legacyTemplates.filter(
    (t) => Number(t.template_set_id) === LEGACY_SET_ID,
  );
  const setTemplateIds = new Set(setTemplates.map((t) => Number(t.id)));

  // --- 1) Restore template cores ---
  const dbTemplates = await prisma.template.findMany({
    where: { templateSet: { siteId: site.id } },
    include: { blocks: true },
  });

  const nameMap: Record<string, string[]> = {
    Homepage: ["Homepage", "homepage"],
    Pagina: ["Pagina", "page"],
    "Overzicht activiteiten": ["Overzicht activiteiten", "activiteit"],
  };

  let cores = 0;
  for (const lt of setTemplates) {
    const rawName = String(lt.name || "");
    const db =
      dbTemplates.find((t) => t.name === rawName) ||
      dbTemplates.find((t) =>
        (nameMap[rawName] || [rawName]).some((a) =>
          t.name.toLowerCase().includes(a.toLowerCase()),
        ),
      ) ||
      (/home/i.test(rawName)
        ? dbTemplates.find((t) => /home/i.test(t.name))
        : /pagina|page/i.test(rawName)
          ? dbTemplates.find((t) => /pagina|page/i.test(t.name))
          : dbTemplates.find((t) => /overzicht|activiteit/i.test(t.name)));

    if (!db) {
      console.warn("No core match for", rawName);
      continue;
    }
    const core = normalizeLegacyTemplateCore(String(lt.core || ""), "kiekeboe");
    await prisma.template.update({
      where: { id: db.id },
      data: {
        coreHtml: core,
        menuHtml: String(lt.menu || ""),
        submenuHtml: String(lt.submenu || ""),
      },
    });
    cores++;
    console.log(`core ✓ ${db.name} (${core.length} chars)`);
  }

  // --- 2) Restore section layouts by template + order (handles duplicate names) ---
  const oldTidToDb = new Map<number, (typeof dbTemplates)[0]>();
  for (const lt of setTemplates) {
    const rawName = String(lt.name || "");
    const db =
      dbTemplates.find((t) => t.name === rawName) ||
      (/home/i.test(rawName)
        ? dbTemplates.find((t) => /home/i.test(t.name))
        : /pagina|page/i.test(rawName)
          ? dbTemplates.find((t) => /pagina|page/i.test(t.name))
          : dbTemplates.find((t) => /overzicht|activiteit/i.test(t.name)));
    if (db) oldTidToDb.set(Number(lt.id), db);
  }

  // Refresh blocks after core updates
  const dbTemplatesFresh = await prisma.template.findMany({
    where: { templateSet: { siteId: site.id } },
    include: { blocks: { orderBy: { sortOrder: "asc" } } },
  });
  for (const [oldId, oldDb] of oldTidToDb) {
    const fresh = dbTemplatesFresh.find((t) => t.id === oldDb.id);
    if (fresh) oldTidToDb.set(oldId, fresh);
  }

  const oldTbToNew = new Map<number, string>();
  let blocksRestored = 0;

  for (const [oldTid, dbTemplate] of oldTidToDb) {
    const lbs = legacyBlocks
      .filter((b) => Number(b.template_id) === oldTid)
      .sort((a, b) => Number(a.id) - Number(b.id));
    const dbBlocks = [...dbTemplate.blocks].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    for (let i = 0; i < lbs.length; i++) {
      const lb = lbs[i];
      const name = String(lb.name || "").trim();
      const html = cleanLegacyHtml(String(lb.content || lb.original || ""));
      if (!html) continue;

      let nb = dbBlocks[i];
      if (!nb) {
        nb = await prisma.templateBlock.create({
          data: {
            templateId: dbTemplate.id,
            name: name || `Section ${lb.id}`,
            defaultHtml: html,
            isRepeatable: Boolean(Number(lb.repeatable)),
            sortOrder: i,
          },
        });
        dbBlocks.push(nb);
        console.log(`  + created block ${name}`);
      } else {
        await prisma.templateBlock.update({
          where: { id: nb.id },
          data: {
            defaultHtml: html,
            name: name || nb.name,
            sortOrder: i,
          },
        });
      }
      oldTbToNew.set(Number(lb.id), nb.id);
      blocksRestored++;
    }
  }
  console.log(`section layouts restored: ${blocksRestored}`);

  // --- 3) Re-map page block content from dump (preserve links, use BS layouts) ---
  const pages = await prisma.page.findMany({
    where: { siteId: site.id },
    include: {
      blocks: { include: { templateBlock: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  const blocksByOldPage = new Map<number, Record<string, unknown>[]>();
  for (const b of legacyPageBlocks) {
    const pid = Number(b.page_id);
    if (!blocksByOldPage.has(pid)) blocksByOldPage.set(pid, []);
    blocksByOldPage.get(pid)!.push(b);
  }

  let contentFixed = 0;
  for (const page of pages) {
    if (page.legacyId == null) continue;
    const oldBlocks = blocksByOldPage.get(page.legacyId) || [];
    const used = new Set<string>();

    for (const old of oldBlocks) {
      const newTbId = oldTbToNew.get(Number(old.template_block_id));
      if (!newTbId) continue;
      const cur = page.blocks.find(
        (c) => c.templateBlockId === newTbId && !used.has(c.id),
      );
      if (!cur) continue;
      used.add(cur.id);
      const layout = cur.templateBlock?.defaultHtml || "";
      const next = mapLegacyFields(layout, old.content);
      if (next !== cur.content) {
        await prisma.pageBlock.update({
          where: { id: cur.id },
          data: { content: next },
        });
        contentFixed++;
      }
    }
  }
  console.log(`page block contents remapped: ${contentFixed}`);
  console.log(`template cores restored: ${cores}`);
  console.log("Done. Kiekeboe is Bootstrap again (no Tailwind conversion).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

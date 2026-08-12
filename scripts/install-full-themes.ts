/**
 * Install full MotionCMS theme shells + static assets for Kiekeboe.
 *
 * 1. Copies CSS/JS/fonts/lib from legacy docroot → public/theme/kiekeboe
 * 2. Restores full template `core` HTML from the SQL dump (set 67)
 * 3. Converts placeholders to {{sections}} / {{menu}} / {{insert:[TAG]}}
 *
 *   npx tsx scripts/install-full-themes.ts
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { normalizeLegacyTemplateCore } from "../src/lib/theme";

const prisma = new PrismaClient();

const HOME = process.env.HOME || "";
const DUMP =
  process.env.LEGACY_SQL ||
  path.join(HOME, "Projects/cmsinmotion2/cmsinmotion_kinderdagverblijfkiekeboe.sql");
const CONTENT_SRC =
  process.env.LEGACY_CONTENT ||
  path.join(HOME, "Projects/cmsinmotion2/cms/docroot/content");
const THEME_SLUG = "kiekeboe";
const THEME_DST = path.join(process.cwd(), "public/theme", THEME_SLUG);
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
    if (row.length) {
      rows.push(row);
    }
  }
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, idx) => {
      o[c] = r[idx];
    });
    return o;
  });
}

function copyThemeAssets() {
  if (!fs.existsSync(CONTENT_SRC)) {
    console.warn("Legacy content dir not found:", CONTENT_SRC);
    return;
  }
  fs.mkdirSync(THEME_DST, { recursive: true });
  for (const dir of ["css", "js", "fonts", "lib"]) {
    const src = path.join(CONTENT_SRC, dir);
    const dst = path.join(THEME_DST, dir);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    execSync(`rsync -a --delete "${src}/" "${dst}/"`, { stdio: "inherit" });
  }
  // favicon + logo only (full images dump is huge)
  const fav = path.join(CONTENT_SRC, "favicon.ico");
  if (fs.existsSync(fav)) {
    fs.copyFileSync(fav, path.join(THEME_DST, "favicon.ico"));
  }
  fs.mkdirSync(path.join(THEME_DST, "images"), { recursive: true });
  const logo = path.join(CONTENT_SRC, "images", "logo.png");
  if (fs.existsSync(logo)) {
    fs.copyFileSync(logo, path.join(THEME_DST, "images", "logo.png"));
  }
  console.log("Theme assets →", THEME_DST);
}

async function restoreTemplateCores() {
  if (!fs.existsSync(DUMP)) throw new Error(`Dump not found: ${DUMP}`);
  const sql = fs.readFileSync(DUMP, "utf8");
  const templates = extractTableInserts(sql, "template").flatMap(parseValues);
  const setTemplates = templates.filter(
    (t) => Number(t.template_set_id) === LEGACY_SET_ID,
  );
  console.log(`Found ${setTemplates.length} templates in set ${LEGACY_SET_ID}`);

  const site = await prisma.site.findUnique({ where: { slug: THEME_SLUG } });
  if (!site) throw new Error("Site kiekeboe not found — import legacy site first");

  const dbTemplates = await prisma.template.findMany({
    where: { templateSet: { siteId: site.id } },
  });

  // Map by name (fuzzy)
  function matchDb(name: string) {
    const n = name.toLowerCase();
    return (
      dbTemplates.find((t) => t.name.toLowerCase() === n) ||
      dbTemplates.find((t) => n.includes(t.name.toLowerCase())) ||
      dbTemplates.find((t) => t.name.toLowerCase().includes(n.split(".")[0]))
    );
  }

  // name mapping dump → db
  const aliases: Record<string, string[]> = {
    Homepage: ["Homepage", "homepage", "home"],
    Pagina: ["Pagina", "page", "Standard page"],
    "Overzicht activiteiten": [
      "Overzicht activiteiten",
      "activiteit_overzicht",
      "activiteiten",
    ],
  };

  let updated = 0;
  for (const lt of setTemplates) {
    const rawName = String(lt.name || "");
    let db =
      matchDb(rawName) ||
      dbTemplates.find((t) =>
        (aliases[rawName] || []).some(
          (a) => t.name.toLowerCase() === a.toLowerCase(),
        ),
      );

    // Map known ids from import: Homepage, Pagina, Overzicht activiteiten
    if (!db) {
      if (/home/i.test(rawName)) {
        db = dbTemplates.find((t) => /home/i.test(t.name));
      } else if (/pagina|page/i.test(rawName)) {
        db = dbTemplates.find((t) => /pagina|page|standard/i.test(t.name));
      } else if (/overzicht|activiteit/i.test(rawName)) {
        db = dbTemplates.find((t) => /overzicht|activiteit/i.test(t.name));
      }
    }

    if (!db) {
      console.warn("  no DB match for template", rawName);
      continue;
    }

    const core = normalizeLegacyTemplateCore(
      String(lt.core || ""),
      THEME_SLUG,
    );
    const menuHtml = String(lt.menu || "");
    const submenuHtml = String(lt.submenu || "");

    await prisma.template.update({
      where: { id: db.id },
      data: {
        coreHtml: core,
        menuHtml,
        submenuHtml,
        name: db.name, // keep existing names
      },
    });
    updated++;
    console.log(
      `  ✓ ${db.name} ← ${rawName} (core ${core.length} chars, has sections=${core.includes("{{sections}}")})`,
    );
  }

  // If only some matched, still try assign remaining dump templates by order
  if (updated === 0 && setTemplates.length && dbTemplates.length) {
    console.log("Fallback: assign by sort order");
    for (let i = 0; i < Math.min(setTemplates.length, dbTemplates.length); i++) {
      const core = normalizeLegacyTemplateCore(
        String(setTemplates[i].core || ""),
        THEME_SLUG,
      );
      await prisma.template.update({
        where: { id: dbTemplates[i].id },
        data: {
          coreHtml: core,
          menuHtml: String(setTemplates[i].menu || ""),
          submenuHtml: String(setTemplates[i].submenu || ""),
        },
      });
      updated++;
      console.log(`  ✓ ${dbTemplates[i].name} (fallback #${i})`);
    }
  }

  console.log(`Templates updated: ${updated}`);
}

async function main() {
  console.log("=== Install full themes ===");
  copyThemeAssets();
  await restoreTemplateCores();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Compile site LESS entry to CSS for the page builder / public theme.
 *
 *   npx tsx scripts/compile-theme-less.ts [themeSlug]
 *   npx tsx scripts/compile-theme-less.ts kiekeboe
 */
import fs from "fs";
import path from "path";
import less from "less";

const themeSlug = process.argv[2] || "kiekeboe";
const entryName = process.argv[3] || "kiekeboe.less";

async function main() {
  const base = path.join(process.cwd(), "public/theme", themeSlug, "css");
  const entry =
    fs.existsSync(path.join(base, "less-src", entryName))
      ? path.join(base, "less-src", entryName)
      : path.join(base, entryName);

  if (!fs.existsSync(entry)) {
    console.error("LESS entry not found:", entry);
    process.exit(1);
  }

  const src = fs.readFileSync(entry, "utf8");
  const out = path.join(base, entryName.replace(/\.less$/i, ".css"));

  const result = await less.render(src, {
    filename: entry,
    paths: [path.dirname(entry)],
    rewriteUrls: "all",
  });

  fs.writeFileSync(
    out,
    `/* Compiled from ${path.basename(entry)} ${new Date().toISOString()} */\n${result.css}`,
  );
  console.log("Wrote", out, `(${result.css.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { grokChat, extractJsonObject, xaiApiKey } from "./xai";
import { parseStoredContent } from "./sections";
import {
  EIGHT_BY_EIGHT_CRITERIA,
  EIGHT_BY_EIGHT_VERSION,
  type RubricCriterion,
} from "./eight-by-eight-rubric";

export type ScoreStatus = "pass" | "partial" | "miss";

export type CriterionResult = {
  id: string;
  label: string;
  group: RubricCriterion["group"];
  weight: number;
  score: number;
  status: ScoreStatus;
  hint: string;
  note: string;
  source: "rules" | "grok";
};

export type EightByEightResult = {
  version: string;
  total: number;
  criteria: CriterionResult[];
  scoredAt: string;
};

export type PageForScore = {
  title: string;
  slug: string;
  metaDescription: string;
  shellHtml?: string | null;
  blocks: {
    isHidden: boolean;
    content: string;
    templateBlock: { name: string; defaultHtml: string } | null;
    repeatItems: { isHidden: boolean; content: string }[];
  }[];
};

type OutlineSection = {
  name: string;
  text: string;
  html: string;
  fieldText: string;
  hasImg: boolean;
  hasVideo: boolean;
  hasCta: boolean;
  linkCount: number;
  repeatCount: number;
};

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRe(html: string, re: RegExp) {
  return re.test(html);
}

function countRe(html: string, re: RegExp) {
  return (html.match(re) || []).length;
}

function statusOf(score: number): ScoreStatus {
  if (score >= 0.75) return "pass";
  if (score >= 0.4) return "partial";
  return "miss";
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

const CTA_RE =
  /koop|buy now|bestel|aanmelden|inschrijven|start nu|claim|add to cart|checkout|gratis proberen|get started|sign up/i;
const PRICE_RE = /€|eur\b|\$\s?\d|prijs|price|per maand|\/mo\b/i;
const FAQ_RE = /\bfaq\b|veelgestelde|guarantee|garantie|money[- ]?back|niet goed/i;
const PROOF_RE =
  /testimonial|review|klant|ervaring|social proof|quote|wat mensen zeggen/i;
const HERO_RE = /\bhero\b|headline|boven de vouw|videoheader/i;
const STORY_RE = /\bover ons\b|\babout\b|ons verhaal|story|team|wie wij zijn/i;
const BENEFIT_RE =
  /voordeel|voordelen|waarom|benefit|wat je krijgt|resultaat|zonder dat/i;
const URGENCY_RE =
  /timer|countdown|schaarste|laatste kans|beperkt|nog \d|uur korting|deadline|bonus voor de eerste|voorraad/i;
const PAIN_RE =
  /pijn|angst|probleem|zonder |frustrat|moeite|last van|niet lukt/i;
const OUTCOME_RE =
  /eindresultaat|zodat je|stel je voor|binnen \d|in \d+ (weken|dagen)|na [0-9]/i;

function buildOutline(page: PageForScore): {
  sections: OutlineSection[];
  shellText: string;
  shellHtml: string;
  allText: string;
  allHtml: string;
} {
  const sections: OutlineSection[] = [];
  for (const b of page.blocks) {
    if (b.isHidden) continue;
    const html = b.templateBlock?.defaultHtml || "";
    const parsed = parseStoredContent(b.content, html);
    const fieldText = Object.entries(parsed.fields)
      .filter(([k]) => !k.includes("__"))
      .map(([, v]) => stripTags(String(v || "")))
      .join(" ");
    const layout = parsed.layoutHtml || html;
    const repeats = (b.repeatItems || []).filter((r) => !r.isHidden);
    const repeatText = repeats
      .map((r) => {
        try {
          const j = JSON.parse(r.content) as { fields?: Record<string, string> };
          return Object.values(j.fields || {}).join(" ");
        } catch {
          return stripTags(r.content);
        }
      })
      .join(" ");
    const blob = `${layout}\n${fieldText}\n${repeatText}`;
    sections.push({
      name: b.templateBlock?.name || "Section",
      text: `${fieldText} ${repeatText}`.trim(),
      html: blob,
      fieldText,
      hasImg: /<img\b/i.test(blob) || Object.keys(parsed.fields).some((k) =>
        parsed.fields[k]?.match(/\.(png|jpe?g|webp|gif|svg)/i),
      ),
      hasVideo: /<video\b|youtube|vimeo/i.test(blob),
      hasCta:
        CTA_RE.test(blob) || /<a\b[^>]*class="[^"]*btn/i.test(blob),
      linkCount: countRe(blob, /<a\b[^>]*href=/gi),
      repeatCount: repeats.length,
    });
  }
  const shellHtml = page.shellHtml || "";
  const shellText = stripTags(shellHtml);
  const allHtml = `${shellHtml}\n${sections.map((s) => s.html).join("\n")}`;
  const allText = `${page.title} ${page.metaDescription} ${shellText} ${sections.map((s) => s.text).join(" ")}`;
  return { sections, shellText, shellHtml, allText, allHtml };
}

function scoreRules(page: PageForScore): Record<string, { score: number; note: string }> {
  const { sections, shellHtml, allHtml, allText } = buildOutline(page);
  const n = sections.length;
  const first = sections.slice(0, Math.min(2, n));
  const last = sections.slice(-1)[0];
  const names = sections.map((s) => s.name.toLowerCase()).join(" ");

  const out: Record<string, { score: number; note: string }> = {};

  const temptHit =
    first.some((s) => s.hasImg || s.hasVideo) &&
    first.some((s) => s.text.length > 20);
  out.tips_tempt = {
    score: clamp01(
      (temptHit ? 0.55 : 0.15) +
        (HERO_RE.test(names) || /hero/i.test(first[0]?.name || "")
          ? 0.25
          : 0) +
        (PAIN_RE.test(first.map((s) => s.text).join(" ")) ||
        OUTCOME_RE.test(first.map((s) => s.text).join(" "))
          ? 0.2
          : 0),
    ),
    note: temptHit
      ? "Hero has image/video and copy."
      : "No clear hero (headline + image).",
  };

  const influenceHit =
    PROOF_RE.test(allText) ||
    STORY_RE.test(names) ||
    sections.some((s) => s.repeatCount >= 2 && PROOF_RE.test(s.name + s.text));
  out.tips_influence = {
    score: influenceHit ? 0.8 : STORY_RE.test(allText) ? 0.45 : 0.15,
    note: influenceHit
      ? "Trust or social proof is present."
      : "No clear story or testimonials.",
  };

  const bullets = countRe(allHtml, /<li\b/gi);
  out.tips_persuade = {
    score: clamp01(
      (BENEFIT_RE.test(allText) ? 0.45 : 0.1) +
        (bullets >= 3 ? 0.35 : bullets > 0 ? 0.15 : 0) +
        (PAIN_RE.test(allText) ? 0.2 : 0),
    ),
    note:
      bullets >= 3
        ? "Benefits/bullets found."
        : "Few benefit bullets — sell holes, not drills.",
  };

  const sellBits =
    (PRICE_RE.test(allText) ? 1 : 0) +
    (sections.some((s) => s.hasCta) ? 1 : 0) +
    (FAQ_RE.test(allText) ? 1 : 0) +
    (last?.hasCta ? 1 : 0);
  out.tips_sell = {
    score: clamp01(sellBits / 4),
    note:
      sellBits >= 3
        ? "Offer, CTA, and close are in place."
        : "Offer / CTA / FAQ / price is incomplete.",
  };

  const hrefs = (allHtml.match(/href=["']([^"']+)["']/gi) || [])
    .map((h) => h.replace(/^href=["']|["']$/gi, ""))
    .filter(
      (h) =>
        h &&
        h !== "#" &&
        !h.startsWith("javascript:") &&
        !h.startsWith("mailto:") &&
        !h.startsWith("#"),
    );
  const unique = new Set(hrefs.map((h) => h.split("?")[0]));
  const menuToken = /\{\{menu\}\}/.test(shellHtml);
  let ctaScore = 1;
  if (unique.size <= 2 && !menuToken) ctaScore = 1;
  else if (unique.size <= 4) ctaScore = 0.55;
  else if (unique.size <= 8) ctaScore = 0.3;
  else ctaScore = 0.1;
  if (menuToken) ctaScore = Math.min(ctaScore, 0.45);
  out.one_cta = {
    score: ctaScore,
    note: menuToken
      ? "Header still has a menu ({{menu}}) — 8x8 wants one CTA."
      : `${unique.size} unique links on the page.`,
  };

  out.steady_target = {
    score: clamp01(
      (PAIN_RE.test(allText) ? 0.45 : 0.1) +
        (OUTCOME_RE.test(allText) ? 0.45 : 0.1) +
        (/voor.?na|before.?after|was .* nu/i.test(allText) ? 0.2 : 0),
    ),
    note: "Pain vs desired state (rules). Grok can judge the copy more sharply.",
  };

  const specHits = countRe(
    allText,
    /\b(ghz|gb ram|specs?|specificatie|processor|pixel|megapixel)\b/gi,
  );
  out.emotion_over_specs = {
    score: clamp01(0.7 - specHits * 0.15 + (OUTCOME_RE.test(allText) ? 0.2 : 0)),
    note:
      specHits > 2
        ? "Quite a few technical specs — 8x8: sell holes, not drills."
        : "Few technical specs in the copy.",
  };

  const longParas = countRe(allHtml, /<(p|div)[^>]*>[^<]{400,}/gi);
  const imgCount = sections.filter((s) => s.hasImg || s.hasVideo).length;
  out.bite_size = {
    score: clamp01(
      (n >= 4 ? 0.4 : n >= 2 ? 0.2 : 0.05) +
        (imgCount >= Math.max(2, Math.floor(n / 2)) ? 0.35 : 0.1) +
        (longParas === 0 ? 0.25 : longParas < 3 ? 0.1 : 0),
    ),
    note:
      longParas > 2
        ? "Long text blocks — break them up with images."
        : "Blocks look scannable.",
  };

  const progress = /progress|leesvoortgang|scroll-progress/i.test(allHtml);
  out.start_with_end = {
    score: clamp01(
      (last?.hasCta ? 0.5 : 0.1) +
        (first.some((s) => s.hasCta) ? 0.2 : 0) +
        (progress ? 0.3 : 0),
    ),
    note: last?.hasCta
      ? "Page closes with a CTA."
      : "The bottom is missing a clear call-to-action.",
  };

  const proofSections = sections.filter(
    (s) => s.repeatCount >= 3 || (s.repeatCount >= 2 && PROOF_RE.test(s.name)),
  );
  out.specific_proof = {
    score: proofSections.length
      ? clamp01(0.5 + Math.min(proofSections[0].repeatCount, 6) * 0.08)
      : PROOF_RE.test(allText)
        ? 0.4
        : 0.1,
    note: proofSections[0]
      ? `Proof group with ${proofSections[0].repeatCount} items.`
      : "No grouped testimonials (cheerleader effect).",
  };

  out.urgency = {
    score: URGENCY_RE.test(allText + allHtml)
      ? 0.85
      : /nu|vandaag|beperkt/i.test(allText)
        ? 0.4
        : 0.1,
    note: URGENCY_RE.test(allText + allHtml)
      ? "Urgency or scarcity found."
      : "No timer, stock limit, or deadline.",
  };

  out.aftercare = {
    score: FAQ_RE.test(allText) ? 0.85 : /vertrouw|veilig|risk.?free/i.test(allText) ? 0.4 : 0.15,
    note: FAQ_RE.test(allText)
      ? "FAQ or guarantee present."
      : "No FAQ/guarantee to remove objections.",
  };

  return out;
}

async function grokCopyScores(page: PageForScore): Promise<Record<
  string,
  { score: number; note: string }
> | null> {
  if (!xaiApiKey()) return null;
  const { sections } = buildOutline(page);
  const outline = sections
    .slice(0, 12)
    .map((s, i) => `${i + 1}. ${s.name}\n${s.text.slice(0, 400)}`)
    .join("\n\n")
    .slice(0, 8000);

  try {
    const raw = await grokChat({
      system: `You score a sales page against the IMU 8x8 Challenge.
Return JSON only:
{"steady_target":{"score":0-1,"note":"..."},"emotion_over_specs":{"score":0-1,"note":"..."}}
score 1 = meets the criterion, 0 = missing. note max 140 characters, English.`,
      user: `Page: ${page.title}\n\n${outline}`,
      temperature: 0.2,
      timeoutMs: 40_000,
      json: true,
    });
    const parsed = extractJsonObject(raw) as Record<
      string,
      { score?: number; note?: string }
    >;
    const pick = (id: string) => {
      const row = parsed[id];
      if (!row || typeof row.score !== "number") return null;
      return {
        score: clamp01(row.score),
        note: String(row.note || "").slice(0, 180),
      };
    };
    const a = pick("steady_target");
    const b = pick("emotion_over_specs");
    const out: Record<string, { score: number; note: string }> = {};
    if (a) out.steady_target = a;
    if (b) out.emotion_over_specs = b;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export async function scoreEightByEight(
  page: PageForScore,
): Promise<EightByEightResult> {
  const rules = scoreRules(page);
  const grok = await grokCopyScores(page);
  if (grok) {
    for (const [id, row] of Object.entries(grok)) {
      const prev = rules[id];
      rules[id] = {
        score: clamp01((prev?.score ?? 0.4) * 0.35 + row.score * 0.65),
        note: row.note || prev?.note || "",
      };
    }
  }

  const criteria: CriterionResult[] = EIGHT_BY_EIGHT_CRITERIA.map((c) => {
    const hit = rules[c.id] || { score: 0, note: "Not scored." };
    return {
      id: c.id,
      label: c.label,
      group: c.group,
      weight: c.weight,
      score: hit.score,
      status: statusOf(hit.score),
      hint: c.hint,
      note: hit.note,
      source:
        grok && (c.id === "steady_target" || c.id === "emotion_over_specs")
          ? "grok"
          : "rules",
    };
  });

  const weightSum = criteria.reduce((s, c) => s + c.weight, 0);
  const total = Math.round(
    criteria.reduce((s, c) => s + c.score * c.weight, 0) / (weightSum || 1) * 100,
  );

  return {
    version: EIGHT_BY_EIGHT_VERSION,
    total,
    criteria,
    scoredAt: new Date().toISOString(),
  };
}

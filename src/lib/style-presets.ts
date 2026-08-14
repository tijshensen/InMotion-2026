/**
 * Named Tailwind class presets + similarity scan across a site.
 * Source of truth stays the class string on each element.
 */

import { prisma } from "@/lib/db";
import { setClassAtNid, stampLayoutNids } from "@/lib/layout-html";
import { parseStoredContent, serializeContent } from "@/lib/sections";
import {
  classSimilarity,
  extractClassedElements,
  isSimilarClass,
  normalizeClass,
  type ExtractedEl,
  type PresetHit,
  type PresetHitKind,
  type UndoItem,
} from "@/lib/style-preset-match";

export {
  normalizeClass,
  type PresetHit,
  type PresetHitKind,
  type UndoItem,
} from "@/lib/style-preset-match";

function pushHits(
  hits: PresetHit[],
  els: ExtractedEl[],
  sourceClass: string,
  sourceTag: string,
  meta: {
    kind: PresetHitKind;
    targetId: string;
    pageId?: string;
    pageTitle?: string;
    sectionName?: string;
  },
  exclude?: { pageBlockId?: string; nid?: string },
) {
  for (const el of els) {
    if (
      exclude?.pageBlockId &&
      meta.kind === "pageBlock" &&
      meta.targetId === exclude.pageBlockId &&
      el.nid === exclude.nid
    ) {
      continue;
    }
    const sameTag = !sourceTag || el.tag === sourceTag;
    if (!isSimilarClass(sourceClass, el.className, sameTag)) continue;
    hits.push({
      id: `${meta.kind}:${meta.targetId}:${el.nid}`,
      kind: meta.kind,
      targetId: meta.targetId,
      nid: el.nid,
      tag: el.tag,
      className: el.className,
      score: classSimilarity(sourceClass, el.className),
      pageId: meta.pageId,
      pageTitle: meta.pageTitle,
      sectionName: meta.sectionName,
    });
  }
}

export async function scanSimilarClasses(opts: {
  siteId: string;
  className: string;
  tag?: string;
  exclude?: { pageBlockId?: string; nid?: string };
  limit?: number;
}): Promise<PresetHit[]> {
  const source = normalizeClass(opts.className);
  if (!source) return [];
  const sourceTag = (opts.tag || "").toLowerCase();
  const hits: PresetHit[] = [];

  const pages = await prisma.page.findMany({
    where: { siteId: opts.siteId },
    select: {
      id: true,
      title: true,
      blocks: {
        select: {
          id: true,
          content: true,
          templateBlock: { select: { name: true, defaultHtml: true } },
        },
      },
    },
  });

  for (const page of pages) {
    for (const block of page.blocks) {
      const templateHtml = block.templateBlock?.defaultHtml || "";
      const parsed = parseStoredContent(block.content, templateHtml);
      const html = parsed.layoutHtml || templateHtml;
      pushHits(
        hits,
        extractClassedElements(html),
        source,
        sourceTag,
        {
          kind: "pageBlock",
          targetId: block.id,
          pageId: page.id,
          pageTitle: page.title,
          sectionName: block.templateBlock?.name,
        },
        opts.exclude,
      );
    }
  }

  const templates = await prisma.template.findMany({
    where: { templateSet: { siteId: opts.siteId } },
    select: {
      id: true,
      name: true,
      coreHtml: true,
      blocks: { select: { id: true, name: true, defaultHtml: true } },
    },
  });

  for (const tpl of templates) {
    pushHits(hits, extractClassedElements(tpl.coreHtml), source, sourceTag, {
      kind: "shell",
      targetId: tpl.id,
      sectionName: `${tpl.name} layout`,
    });
    for (const block of tpl.blocks) {
      pushHits(
        hits,
        extractClassedElements(block.defaultHtml),
        source,
        sourceTag,
        {
          kind: "templateBlock",
          targetId: block.id,
          sectionName: `${block.name} (shared)`,
        },
      );
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, opts.limit ?? 80);
}

export async function applyPresetHits(opts: {
  siteId: string;
  presetId: string;
  className: string;
  hits: { kind: PresetHitKind; targetId: string; nid: string }[];
}): Promise<{
  undo: UndoItem[];
  updatedPageBlocks: { id: string; content: string }[];
  updatedTemplateBlocks: { id: string; defaultHtml: string }[];
}> {
  const nextClass = normalizeClass(opts.className);
  const grouped = new Map<
    string,
    { kind: PresetHitKind; targetId: string; nids: string[] }
  >();
  for (const hit of opts.hits) {
    const key = `${hit.kind}:${hit.targetId}`;
    const g = grouped.get(key);
    if (g) g.nids.push(hit.nid);
    else {
      grouped.set(key, {
        kind: hit.kind,
        targetId: hit.targetId,
        nids: [hit.nid],
      });
    }
  }

  const undo: UndoItem[] = [];
  const updatedPageBlocks: { id: string; content: string }[] = [];
  const updatedTemplateBlocks: { id: string; defaultHtml: string }[] = [];

  for (const g of grouped.values()) {
    if (g.kind === "pageBlock") {
      const block = await prisma.pageBlock.findFirst({
        where: {
          id: g.targetId,
          page: { siteId: opts.siteId },
        },
        include: { templateBlock: { select: { defaultHtml: true } } },
      });
      if (!block) continue;
      const templateHtml = block.templateBlock?.defaultHtml || "";
      const parsed = parseStoredContent(block.content, templateHtml);
      const before = parsed.layoutHtml || templateHtml;
      undo.push({
        kind: "pageBlock",
        id: block.id,
        field: "content",
        value: block.content,
      });
      let html = stampLayoutNids(before);
      for (const nid of g.nids) html = setClassAtNid(html, nid, nextClass);
      const content = serializeContent({
        fields: parsed.fields,
        layoutHtml: html,
      });
      await prisma.pageBlock.update({
        where: { id: block.id },
        data: { content },
      });
      updatedPageBlocks.push({ id: block.id, content });
    } else if (g.kind === "templateBlock") {
      const block = await prisma.templateBlock.findFirst({
        where: {
          id: g.targetId,
          template: { templateSet: { siteId: opts.siteId } },
        },
      });
      if (!block) continue;
      undo.push({
        kind: "templateBlock",
        id: block.id,
        field: "defaultHtml",
        value: block.defaultHtml,
      });
      let html = stampLayoutNids(block.defaultHtml);
      for (const nid of g.nids) html = setClassAtNid(html, nid, nextClass);
      await prisma.templateBlock.update({
        where: { id: block.id },
        data: { defaultHtml: html },
      });
      updatedTemplateBlocks.push({ id: block.id, defaultHtml: html });
    } else {
      const tpl = await prisma.template.findFirst({
        where: {
          id: g.targetId,
          templateSet: { siteId: opts.siteId },
        },
      });
      if (!tpl) continue;
      undo.push({
        kind: "shell",
        id: tpl.id,
        field: "coreHtml",
        value: tpl.coreHtml,
      });
      let html = stampLayoutNids(tpl.coreHtml);
      for (const nid of g.nids) html = setClassAtNid(html, nid, nextClass);
      await prisma.template.update({
        where: { id: tpl.id },
        data: { coreHtml: html },
      });
    }
  }

  await prisma.stylePreset.update({
    where: { id: opts.presetId },
    data: { lastUndo: JSON.stringify(undo), className: nextClass },
  });

  return { undo, updatedPageBlocks, updatedTemplateBlocks };
}

export async function undoPresetApply(opts: {
  siteId: string;
  presetId: string;
}): Promise<{
  restored: number;
  updatedPageBlocks: { id: string; content: string }[];
  updatedTemplateBlocks: { id: string; defaultHtml: string }[];
}> {
  const preset = await prisma.stylePreset.findFirst({
    where: { id: opts.presetId, siteId: opts.siteId },
  });
  if (!preset?.lastUndo) {
    return { restored: 0, updatedPageBlocks: [], updatedTemplateBlocks: [] };
  }
  let items: UndoItem[] = [];
  try {
    items = JSON.parse(preset.lastUndo) as UndoItem[];
  } catch {
    items = [];
  }

  const updatedPageBlocks: { id: string; content: string }[] = [];
  const updatedTemplateBlocks: { id: string; defaultHtml: string }[] = [];
  let restored = 0;

  for (const item of items) {
    if (item.kind === "pageBlock" && item.field === "content") {
      const res = await prisma.pageBlock.updateMany({
        where: { id: item.id, page: { siteId: opts.siteId } },
        data: { content: item.value },
      });
      if (res.count) {
        restored += 1;
        updatedPageBlocks.push({ id: item.id, content: item.value });
      }
    } else if (item.kind === "templateBlock" && item.field === "defaultHtml") {
      const res = await prisma.templateBlock.updateMany({
        where: {
          id: item.id,
          template: { templateSet: { siteId: opts.siteId } },
        },
        data: { defaultHtml: item.value },
      });
      if (res.count) {
        restored += 1;
        updatedTemplateBlocks.push({
          id: item.id,
          defaultHtml: item.value,
        });
      }
    } else if (item.kind === "shell" && item.field === "coreHtml") {
      const res = await prisma.template.updateMany({
        where: { id: item.id, templateSet: { siteId: opts.siteId } },
        data: { coreHtml: item.value },
      });
      if (res.count) restored += 1;
    }
  }

  await prisma.stylePreset.update({
    where: { id: opts.presetId },
    data: { lastUndo: "" },
  });

  return { restored, updatedPageBlocks, updatedTemplateBlocks };
}

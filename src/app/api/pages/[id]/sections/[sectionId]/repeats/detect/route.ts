import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  applyExtractToContent,
  prepareRepeatableSection,
  repeatRowsMismatchCatalog,
  repeatSeedsAreClones,
  storedRepeatRowsAreClones,
} from "@/lib/section-repeat";
import {
  fetchPageHtml,
  sectionHtmlFromGrokRaw,
} from "@/lib/import-from-url";
import { serializeContent } from "@/lib/sections";

type Ctx = { params: Promise<{ id: string; sectionId: string }> };

async function sourceHtmlForPage(pageId: string): Promise<string> {
  const page = await prisma.page.findFirst({
    where: { id: pageId },
    select: { siteId: true },
  });
  if (!page) return "";
  const grok = await prisma.grokImport.findFirst({
    where: { siteId: page.siteId },
    orderBy: { createdAt: "desc" },
    select: { sourceUrl: true },
  });
  const setting = await prisma.siteSetting.findFirst({
    where: { siteId: page.siteId, key: "importedFromUrl" },
    select: { value: true },
  });
  const urls = [grok?.sourceUrl, setting?.value].filter(
    (u, i, a) => Boolean(u) && a.indexOf(u) === i,
  ) as string[];
  for (const url of urls) {
    try {
      const html = await fetchPageHtml(url);
      if (html) return html;
    } catch {
      /* try next */
    }
  }
  return "";
}

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: pageId, sectionId } = await ctx.params;

  const block = await prisma.pageBlock.findFirst({
    where: { id: sectionId, pageId },
    include: {
      templateBlock: true,
      repeatItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!block) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const templateHtml = block.templateBlock?.defaultHtml || "";
  const cloned = storedRepeatRowsAreClones(block.repeatItems);
  const mismatched = repeatRowsMismatchCatalog(
    block.repeatItems,
    templateHtml,
  );
  if (block.repeatItems.length && !cloned && !mismatched) {
    return NextResponse.json({ block, detected: false });
  }

  const page = await prisma.page.findFirst({
    where: { id: pageId },
    select: { siteId: true },
  });
  const grok = page
    ? await prisma.grokImport.findFirst({
        where: { siteId: page.siteId },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const grokSection = grok
    ? sectionHtmlFromGrokRaw(grok.raw, block.templateBlock?.name || "")
    : null;
  const fromGrok = grokSection
    ? prepareRepeatableSection(grokSection)
    : null;

  const sourceHtml = await sourceHtmlForPage(pageId);
  const result = applyExtractToContent(
    block.content,
    templateHtml,
    sourceHtml || undefined,
  );
  if (
    fromGrok?.items.length &&
    !repeatSeedsAreClones(fromGrok.items)
  ) {
    result.items = fromGrok.items;
    result.detected = true;
  }
  if (!result.detected) {
    const refreshed = await prisma.pageBlock.findFirst({
      where: { id: block.id },
      include: {
        templateBlock: true,
        repeatItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    return NextResponse.json({ block: refreshed, detected: false });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pageBlock.update({
      where: { id: block.id },
      data: { content: result.content },
    });
    if (cloned || mismatched) {
      const scraped = block.repeatItems.filter((i) => i.origin === "scraped");
      for (let i = 0; i < scraped.length; i++) {
        const next = result.items[i];
        if (next) {
          await tx.pageBlockRepeatItem.update({
            where: { id: scraped[i].id },
            data: {
              content: serializeContent({
                fields: next.fields,
                labels: next.labels,
              }),
              isHidden: false,
            },
          });
        } else {
          await tx.pageBlockRepeatItem.update({
            where: { id: scraped[i].id },
            data: { isHidden: true },
          });
        }
      }
    } else if (result.items.length) {
      await tx.pageBlockRepeatItem.createMany({
        data: result.items.map((item, i) => ({
          pageBlockId: block.id,
          groupKey: item.groupKey,
          sortOrder: i,
          origin: "scraped",
          content: serializeContent({
            fields: item.fields,
            labels: item.labels,
          }),
        })),
      });
    }
    return tx.pageBlock.findFirst({
      where: { id: block.id },
      include: {
        templateBlock: true,
        repeatItems: { orderBy: { sortOrder: "asc" } },
      },
    });
  });

  return NextResponse.json({
    block: updated,
    detected: true,
    reseeded: cloned || mismatched,
  });
}

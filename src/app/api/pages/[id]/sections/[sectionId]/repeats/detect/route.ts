import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  applyExtractToContent,
  isGenericGroupKey,
  prepareRepeatableSection,
  remintRepeatableNames,
  repeatRowsMismatchCatalog,
  repeatSeedsAreClones,
  sectionSlug,
  storedRepeatRowsAreClones,
} from "@/lib/section-repeat";
import {
  fetchPageHtml,
  sectionHtmlFromGrokRaw,
} from "@/lib/import-from-url";
import { parseStoredContent, serializeContent } from "@/lib/sections";
import {
  localizeFieldImages,
  localizeHtmlImages,
} from "@/lib/import-images";

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
    const name = block.templateBlock?.name || "";
    const key = name ? sectionSlug(name) : "";
    const needsRemint =
      Boolean(key) &&
      block.repeatItems.some(
        (i) => isGenericGroupKey(i.groupKey) || i.groupKey !== key,
      );
    if (!needsRemint) {
      return NextResponse.json({ block, detected: false });
    }
    const parsed = parseStoredContent(block.content, templateHtml);
    const layoutHtml = remintRepeatableNames(
      parsed.layoutHtml || templateHtml,
      name,
    );
    const content = serializeContent({
      fields: parsed.fields,
      layoutHtml,
      repeatGroups: parsed.repeatGroups,
    });
    await prisma.$transaction(async (tx) => {
      await tx.pageBlock.update({
        where: { id: block.id },
        data: { content },
      });
      await tx.pageBlockRepeatItem.updateMany({
        where: { pageBlockId: block.id },
        data: { groupKey: key },
      });
      if (
        block.templateBlock &&
        /<repeatable\b/i.test(block.templateBlock.defaultHtml)
      ) {
        await tx.templateBlock.update({
          where: { id: block.templateBlock.id },
          data: {
            defaultHtml: remintRepeatableNames(
              block.templateBlock.defaultHtml,
              name,
            ),
          },
        });
      }
    });
    const reminted = await prisma.pageBlock.findFirst({
      where: { id: block.id },
      include: {
        templateBlock: true,
        repeatItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    return NextResponse.json({ block: reminted, detected: false, reminted: true });
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
    ? prepareRepeatableSection(
        grokSection,
        {},
        block.templateBlock?.name,
      )
    : null;

  const sourceHtml = await sourceHtmlForPage(pageId);
  const result = applyExtractToContent(
    block.content,
    templateHtml,
    sourceHtml || undefined,
    block.templateBlock?.name,
  );
  if (
    fromGrok?.items.length &&
    !repeatSeedsAreClones(fromGrok.items)
  ) {
    result.items = fromGrok.items;
    result.detected = true;
  }
  if (result.detected && page) {
    const site = await prisma.site.findUnique({
      where: { id: page.siteId },
      select: { id: true, slug: true },
    });
    if (site) {
      const ctx = {
        siteId: site.id,
        siteSlug: site.slug,
        sourceOrigin: grok?.sourceUrl,
      };
      const parsed = parseStoredContent(result.content, templateHtml);
      const layoutHtml = await localizeHtmlImages(
        parsed.layoutHtml || templateHtml,
        ctx,
      );
      result.content = serializeContent({
        fields: parsed.fields,
        layoutHtml,
        repeatGroups: parsed.repeatGroups,
      });
      result.items = await Promise.all(
        result.items.map(async (it) => ({
          ...it,
          fields: await localizeFieldImages(it.fields, ctx),
        })),
      );
    }
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
    if (block.templateBlock?.name) {
      await tx.templateBlock.update({
        where: { id: block.templateBlock.id },
        data: {
          defaultHtml: remintRepeatableNames(
            block.templateBlock.defaultHtml,
            block.templateBlock.name,
          ),
        },
      });
    }
    if (cloned || mismatched) {
      const scraped = block.repeatItems.filter((i) => i.origin === "scraped");
      for (let i = 0; i < scraped.length; i++) {
        const next = result.items[i];
        if (next) {
          await tx.pageBlockRepeatItem.update({
            where: { id: scraped[i].id },
            data: {
              groupKey: next.groupKey,
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

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  const user = await prisma.user.upsert({
    where: { email: "admin@cmsinmotion.local" },
    update: {},
    create: {
      email: "admin@cmsinmotion.local",
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      role: Role.SUPERADMIN,
    },
  });

  const site = await prisma.site.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Site",
      slug: "demo",
      siteTitle: "CMSinMotion Demo",
      domain: "localhost",
      members: {
        create: { userId: user.id, role: Role.SUPERADMIN },
      },
      languages: {
        create: {
          name: "Nederlands",
          code: "nl",
          isDefault: true,
          siteTitle: "CMSinMotion Demo",
        },
      },
      settings: {
        create: [
          { key: "multiLanguage", value: "0" },
          { key: "theme", value: "default" },
        ],
      },
    },
    include: { languages: true },
  });

  const language =
    site.languages[0] ||
    (await prisma.language.findFirst({ where: { siteId: site.id } }));

  if (!language) throw new Error("No language for demo site");

  let templateSet = await prisma.templateSet.findFirst({
    where: { siteId: site.id, name: "Default" },
  });

  if (!templateSet) {
    templateSet = await prisma.templateSet.create({
      data: {
        siteId: site.id,
        name: "Default",
        templates: {
          create: {
            name: "Standard page",
            coreHtml: `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{page.title}} — {{site.title}}</title>
  <meta name="description" content="{{page.metaDescription}}" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #111; background: #fafafa; }
    header { background: #0f172a; color: #fff; padding: 1rem 2rem; }
    header a { color: #cbd5e1; text-decoration: none; }
    header a:hover { color: #fff; }
    .menu, .submenu { list-style: none; margin: 0; padding: 0; }
    .menu { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin-top: 0.5rem; align-items: flex-start; }
    .menu-item { position: relative; }
    .submenu { flex-direction: column; gap: 0.25rem; margin-top: 0.35rem; padding-left: 0.5rem; border-left: 2px solid #334155; }
    main { max-width: 720px; margin: 2rem auto; padding: 0 1.5rem; }
    footer { text-align: center; color: #64748b; padding: 2rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  <header>
    <strong>{{site.title}}</strong>
    <nav style="margin-top:0.5rem">{{menu}}</nav>
  </header>
  <main>
    <h1>{{page.title}}</h1>
    {{block:hero}}
    {{block:body}}
  </main>
  <footer>{{insert:footer}}</footer>
</body>
</html>`,
            blocks: {
              create: [
                {
                  name: "hero",
                  defaultHtml: "<p class=\"lead\">Welcome to your new CMS.</p>",
                  sortOrder: 0,
                },
                {
                  name: "body",
                  defaultHtml: "<p>Edit this page in the admin.</p>",
                  sortOrder: 1,
                },
              ],
            },
          },
        },
      },
      include: { templates: { include: { blocks: true } } },
    });
  }

  const template =
    (await prisma.template.findFirst({
      where: { templateSetId: templateSet.id },
      include: { blocks: true },
    })) || null;

  if (!template) throw new Error("No template");

  const existingHome = await prisma.page.findFirst({
    where: { siteId: site.id, slug: "home" },
  });

  if (!existingHome) {
    await prisma.page.create({
      data: {
        siteId: site.id,
        languageId: language.id,
        templateId: template.id,
        authorId: user.id,
        title: "Home",
        menuTitle: "Home",
        slug: "home",
        metaDescription: "Welcome to CMSinMotion",
        isDefault: true,
        sortOrder: 0,
        blocks: {
          create: template.blocks.map((b) => ({
            templateBlockId: b.id,
            content: b.defaultHtml,
            sortOrder: b.sortOrder,
          })),
        },
      },
    });
  }

  // Sample pages for menu builder demos
  for (const sample of [
    {
      title: "About",
      menuTitle: "About",
      slug: "about",
      sortOrder: 1,
      body: "<p>About this site.</p>",
    },
    {
      title: "Contact",
      menuTitle: "Contact",
      slug: "contact",
      sortOrder: 2,
      body: "<p>Get in touch.</p>",
    },
  ] as const) {
    const exists = await prisma.page.findFirst({
      where: { siteId: site.id, languageId: language.id, slug: sample.slug },
    });
    if (!exists) {
      await prisma.page.create({
        data: {
          siteId: site.id,
          languageId: language.id,
          templateId: template.id,
          authorId: user.id,
          title: sample.title,
          menuTitle: sample.menuTitle,
          slug: sample.slug,
          sortOrder: sample.sortOrder,
          inMenu: true,
          blocks: {
            create: template.blocks.map((b) => ({
              templateBlockId: b.id,
              content:
                b.name === "body" ? sample.body : b.defaultHtml,
              sortOrder: b.sortOrder,
            })),
          },
        },
      });
    }
  }

  // Keep demo template CSS in sync for nested menus
  await prisma.template.updateMany({
    where: { templateSetId: templateSet.id, name: "Standard page" },
    data: {
      coreHtml: `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{page.title}} — {{site.title}}</title>
  <meta name="description" content="{{page.metaDescription}}" />
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; color: #111; background: #fafafa; }
    header { background: #0f172a; color: #fff; padding: 1rem 2rem; }
    header a { color: #cbd5e1; text-decoration: none; }
    header a:hover { color: #fff; }
    .menu, .submenu { list-style: none; margin: 0; padding: 0; }
    .menu { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin-top: 0.5rem; align-items: flex-start; }
    .menu-item { position: relative; }
    .submenu { flex-direction: column; gap: 0.25rem; margin-top: 0.35rem; padding-left: 0.5rem; border-left: 2px solid #334155; }
    main { max-width: 720px; margin: 2rem auto; padding: 0 1.5rem; }
    footer { text-align: center; color: #64748b; padding: 2rem; font-size: 0.875rem; }
  </style>
</head>
<body>
  <header>
    <strong>{{site.title}}</strong>
    <nav>{{menu}}</nav>
  </header>
  <main>
    <h1>{{page.title}}</h1>
    {{block:hero}}
    {{block:body}}
  </main>
  <footer>{{insert:footer}}</footer>
</body>
</html>`,
    },
  });

  await prisma.insert.upsert({
    where: { siteId_tag: { siteId: site.id, tag: "footer" } },
    update: {},
    create: {
      siteId: site.id,
      tag: "footer",
      content: "© CMSinMotion — powered by the rewrite",
    },
  });

  console.log("Seed complete");
  console.log("  Login: admin@cmsinmotion.local");
  console.log("  Password: admin123");
  console.log("  Demo site slug: demo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

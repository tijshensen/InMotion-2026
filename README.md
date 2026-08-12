# CMSinMotion (rewrite)

Modern multi-site CMS — full rewrite of the legacy **MotionCMS 3 / cmsinmotion2** PHP app.

| Legacy | New |
|--------|-----|
| PHP 5.4 + MySQL | Next.js 15 + TypeScript |
| Flat includes + ActiveRecord | Prisma + SQLite (dev) / Postgres-ready |
| Pre-render HTML to disk | Live template render |
| Single install per site | Multi-tenant `Site` model |

## Quick start

```bash
# Node 22+
nvm use 22

cd ~/Projects/cmsinmotion
npm install
npx prisma migrate dev
npm run db:seed
# After legacy import:
# npm run db:import-legacy
# npm run db:install-themes   # full Kiekeboe template + CSS/JS
npm run dev
```

Open:

- **Landing:** http://localhost:3000  
- **Admin:** http://localhost:3000/login  
- **Demo public site:** http://localhost:3000/s/demo  

### Seed login

| Field | Value |
|-------|--------|
| Email | `admin@cmsinmotion.local` |
| Password | `admin123` |

Change these before any real deployment.

## Architecture

```
src/
  app/
    admin/          # CMS backend UI
    api/            # REST-ish handlers (auth, pages)
    login/
    s/[siteSlug]/  # Public site renderer
  lib/
    auth.ts         # Sessions (JWT cookie + Session table)
    db.ts           # Prisma client
    render.ts       # Template engine ({{block:x}}, {{insert:y}})
prisma/
  schema.prisma     # Multi-site CMS data model
  seed.ts
```

### Domain model (maps to old tables)

| New model | Old table |
|-----------|-----------|
| `User` + `Role` | `users`, `groups` |
| `Site` | *(new — multi-tenant)* |
| `Language` | `languages` |
| `Page` | `page` |
| `PageBlock` | `page_block` |
| `Template` / `TemplateBlock` / `TemplateSet` | `template`, `template_block`, `template_sets` |
| `Insert` | `inserts` |
| `MediaAsset` | uploads under `docroot/content` |
| `AuditLog` | `logging` |

## Features in this vertical slice

- [x] Auth (login / logout / session)
- [x] Admin shell (dashboard, pages, sites, inserts)
- [x] Page CRUD + block HTML editor
- [x] Template-based public rendering
- [x] Demo site seed
- [x] Section layouts (create/edit HTML with singleline/multiline/img + width/height)
- [x] Visual page builder (canvas looks like the page; edit fields in place)
- [x] Section catalog on pages (+ add / reorder / hide)
- [x] Media library (upload, alt text, pick into editor)
- [ ] Image crop
- [x] Menu builder UI (order, nest, labels, in-menu toggle)
- [x] Legacy site import with real template sections (Kiekeboe)
- [x] Inserts CRUD (create, edit, delete, copy)
- [ ] Multi-language URL routing
- [ ] Domain-based site resolution
- [ ] Roles per site (memberships)
- [ ] Import from old MySQL dump
- [ ] Postgres / Supabase production deploy

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run db:seed
# After legacy import:
# npm run db:import-legacy
# npm run db:install-themes   # full Kiekeboe template + CSS/JS` | Seed admin + demo site |
| `npm run db:studio` | Prisma Studio |
| `npm run db:migrate` | Create/apply migrations |

## Reference codebase

Legacy clone (read-only reference): `~/Projects/cmsinmotion2`

## Production notes

1. Set a strong `AUTH_SECRET`.
2. Switch `DATABASE_URL` to Postgres when ready.
3. Do not commit `.env` or SQLite files.
4. Rehash any migrated passwords with bcrypt (old dump used weak hashes).

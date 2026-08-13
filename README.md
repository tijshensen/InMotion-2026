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

## Deploy on Railway

This app is a Node 22 Next.js server with Prisma + SQLite, disk uploads, and
static site generation. Railway’s container filesystem is wiped on each deploy,
so you **must** attach a persistent volume.

The GitHub repo is already wired for auto-deploy (`railway.json` + `scripts/start-prod.sh`).

### 1. Volume

In the Railway canvas:

1. Right-click → **Volume** (or `⌘K` → “volume”).
2. Connect it to this service.
3. Mount path: `/data`

Railway will inject `RAILWAY_VOLUME_MOUNT_PATH=/data`. The start script uses
that (or `DATA_DIR`) for:

| Path | Contents |
|------|----------|
| `/data/prisma/prod.db` | SQLite database |
| `/data/uploads` | Media library |
| `/data/sites` | Generated static sites |

### 2. Variables

In the service → **Variables**:

| Name | Value |
|------|--------|
| `AUTH_SECRET` | `openssl rand -base64 32` (required) |
| `DATA_DIR` | `/data` (optional if the volume is mounted at `/data`) |
| `DATABASE_URL` | `file:/data/prisma/prod.db` (set automatically when `DATA_DIR` is set) |
| `XAI_API_KEY` | from [console.x.ai](https://console.x.ai) (Import from URL) |
| `ADMIN_EMAIL` | first-boot login (default `admin@cmsinmotion.local`) |
| `ADMIN_PASSWORD` | first-boot password (random + printed in logs if omitted) |
| `CLOUDFLARE_API_TOKEN` | Pages **Edit** token — Publish deploys to `*.pages.dev`. For apex domains also add **Zone → Edit**. |
| `CLOUDFLARE_ACCOUNT_ID` | from the Cloudflare dashboard URL / Workers overview |
| `TRANSIP_LOGIN` | TransIP username — optional auto CNAME / nameserver change |
| `TRANSIP_PRIVATE_KEY` | PEM from TransIP control panel → API |

Do **not** copy the local `file:./prisma/dev.db` URL into Railway.

### 3. Domain

Service → **Settings** → **Networking** → **Generate domain**.

After the first successful deploy, open `/login` with the admin you set (or
the password printed once in the deploy logs). Change it immediately.

`prisma db push` and admin bootstrap run on **start**, not pre-deploy —
volumes are not mounted until the container starts.

### Publish a generated site to Cloudflare Pages

The CMS stays on Railway. **Publish** generates static HTML, then (when the
two Cloudflare variables are set) uploads a standalone bundle to
[Cloudflare Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/).

1. Create an API token: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → custom token with **Account → Cloudflare Pages → Edit**.
2. Copy the **Account ID** from the Workers & Pages overview.
3. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (local `.env` or Railway Variables). Restart the server.
4. On **Websites**, optionally set the Pages project name (defaults to the site slug).
5. Click **Publish** in the top bar.

The public site is then at `https://<project>.pages.dev`. Attach a custom
domain in the Cloudflare dashboard if you want. Assets and uploads are
included in the bundle so the site does not depend on Railway URLs.

## Production notes

1. Set a strong `AUTH_SECRET`.
2. Persist SQLite + uploads + generated sites on a Railway volume (`DATA_DIR`).
3. Do not commit `.env` or SQLite files.
4. Rehash any migrated passwords with bcrypt (old dump used weak hashes).

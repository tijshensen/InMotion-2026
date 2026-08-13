#!/usr/bin/env bash
# Production start for Railway (volume must be mounted — not available at build/pre-deploy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/node_modules/.bin"
cd "$ROOT"

if [ -z "${DATA_DIR:-}" ] && [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
  export DATA_DIR="$RAILWAY_VOLUME_MOUNT_PATH"
fi

if [ -n "${DATA_DIR:-}" ]; then
  mkdir -p "$DATA_DIR/prisma" "$DATA_DIR/uploads" "$DATA_DIR/sites"
  case "${DATABASE_URL:-}" in
    postgres*|*postgresql*)
      echo "[start] DATA_DIR=$DATA_DIR"
      echo "[start] DATABASE_URL=postgres (volume still used for uploads/sites)"
      ;;
    *)
      export DATABASE_URL="file:${DATA_DIR}/prisma/prod.db"
      echo "[start] DATA_DIR=$DATA_DIR"
      echo "[start] DATABASE_URL=file:${DATA_DIR}/prisma/prod.db"
      ;;
  esac
else
  echo "[start] WARNING: no DATA_DIR / volume. SQLite, uploads, and generated sites will be lost on each deploy." >&2
  echo "[start] Attach a Railway volume at /data and set DATA_DIR=/data." >&2
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "[start] AUTH_SECRET is required. Set it in Railway Variables." >&2
  exit 1
fi

if [ ! -x "$BIN/prisma" ] || [ ! -x "$BIN/next" ]; then
  echo "[start] Missing node_modules/.bin/prisma or next. Did the build install dependencies?" >&2
  exit 1
fi

# Client is generated at build (postinstall). Only regenerate if the image is missing it.
if [ ! -d "$ROOT/node_modules/.prisma/client" ]; then
  echo "[start] Prisma Client missing; generating..."
  "$BIN/prisma" generate
fi

# --skip-generate: db push would otherwise generate a second time (~200ms + deprecation noise).
"$BIN/prisma" db push --skip-generate

node scripts/ensure-admin.mjs

# exec so Railway's SIGTERM reaches Next.js. Going through npm/npx makes a
# healthy deploy-replace look like "npm error signal SIGTERM".
echo "[start] next start -H 0.0.0.0 -p ${PORT:-3000}"
exec "$BIN/next" start -H 0.0.0.0 -p "${PORT:-3000}"

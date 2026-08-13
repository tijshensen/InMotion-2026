#!/usr/bin/env bash
# Production start for Railway (volume must be mounted — not available at build/pre-deploy).
set -euo pipefail

if [ -z "${DATA_DIR:-}" ] && [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
  export DATA_DIR="$RAILWAY_VOLUME_MOUNT_PATH"
fi

if [ -n "${DATA_DIR:-}" ]; then
  mkdir -p "$DATA_DIR/prisma" "$DATA_DIR/uploads" "$DATA_DIR/sites"
  case "${DATABASE_URL:-}" in
    postgres*|*postgresql*) ;;
    *)
      export DATABASE_URL="file:${DATA_DIR}/prisma/prod.db"
      ;;
  esac
  echo "[start] DATA_DIR=$DATA_DIR"
  echo "[start] DATABASE_URL=file:${DATA_DIR}/prisma/prod.db (unless Postgres)"
else
  echo "[start] WARNING: no DATA_DIR / volume. SQLite, uploads, and generated sites will be lost on each deploy." >&2
  echo "[start] Attach a Railway volume at /data and set DATA_DIR=/data." >&2
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "[start] AUTH_SECRET is required. Set it in Railway Variables." >&2
  exit 1
fi

npx prisma generate
npx prisma db push
node scripts/ensure-admin.mjs

exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"

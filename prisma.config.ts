import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI config (Prisma 6.19+). Seed used to live in package.json#prisma,
 * which now logs a deprecation warning on every generate / db push.
 *
 * A prisma.config.ts file disables Prisma's automatic .env load, so we
 * restore it here with Node 22's built-in loader (no dotenv dependency).
 */
if (!process.env.DATABASE_URL && existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});

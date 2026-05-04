/**
 * Boot the server (without listening) and write its OpenAPI spec to
 * `apps/api/openapi.json`. This file is committed and used as a snapshot:
 * CI re-generates the spec and fails if it diverges, so any route schema
 * change is reviewed alongside its spec impact.
 *
 * Run via: `pnpm --filter @myhr/api openapi:dump`
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Provide stub env so buildServer can boot without a real DB / live key.
// We never make a DB call here — Prisma is lazy.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.MASTER_API_KEY ??= "0".repeat(32);
process.env.PUBLIC_API_URL ??= "https://api.myhr.example";

const { buildServer } = await import("../src/server.js");

const app = await buildServer();
await app.ready();
const spec = app.swagger();
await app.close();

const outPath = resolve(process.cwd(), "openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${outPath}`);

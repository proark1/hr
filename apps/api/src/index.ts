// Railway sends stdout to its log UI more reliably than stderr, and any
// throw during top-level imports (e.g. zod env validation) would otherwise
// disappear into the void. Use console.log + dynamic imports so a missing
// env var produces a visible error.
console.log("[boot] api starting");

try {
  const { buildServer } = await import("./server.js");
  const { env } = await import("./env.js");
  const app = await buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.log(`[boot] listening on ${env.PORT}`);
} catch (err) {
  console.log("[boot] failed to start", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship as ESM with @prisma/client; transpile so Next
  // can bundle them server-side without ESM/CJS mismatches.
  transpilePackages: ["@myhr/db", "@myhr/sdk", "@myhr/types"],
  // Prisma's engines live outside the source tree; tell Next to leave
  // them alone so the bundler doesn't try to inline them.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

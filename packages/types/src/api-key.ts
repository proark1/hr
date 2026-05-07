import { z } from "zod";

export const ApiKeyScope = z.enum(["master", "partner", "tenant"]);
export type ApiKeyScope = z.infer<typeof ApiKeyScope>;

/** Stored API key — never includes the plaintext secret. */
export const ApiKey = z.object({
  id: z.string().uuid(),
  name: z.string(),
  prefix: z.string().describe("First 24 chars of the key, used for display + lookup."),
  scope: ApiKeyScope,
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKey>;

export const ApiKeyCreate = z.object({
  name: z.string().min(1).max(200),
});
export type ApiKeyCreate = z.infer<typeof ApiKeyCreate>;

/** Response from POST /v1/orgs/:id/api-keys. The plaintext `key` is shown once. */
export const ApiKeyCreated = ApiKey.extend({
  key: z
    .string()
    .describe("Plaintext key, shown only once. Store securely (this won't be retrievable)."),
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreated>;

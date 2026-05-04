import { z } from "zod";

export const Me = z
  .object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    isSuperAdmin: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .describe("The currently authenticated user.");
export type Me = z.infer<typeof Me>;

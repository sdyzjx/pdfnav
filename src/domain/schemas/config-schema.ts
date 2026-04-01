import { z } from "zod";

export const appConfigSchema = z.object({
  version: z.string(),
  providers: z.object({
    bigmodel: z.object({
      apiKey: z.string(),
      baseUrl: z.url(),
    }),
  }),
  updatedAt: z.string(),
});

export type AppConfigSchema = z.infer<typeof appConfigSchema>;


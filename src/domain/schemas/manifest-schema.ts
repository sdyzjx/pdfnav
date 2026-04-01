import { z } from "zod";

export const documentMetadataSchema = z.object({
  docId: z.string(),
  sourcePdf: z.string(),
  sourceFilename: z.string(),
  title: z.string(),
  numPages: z.number().nullable(),
  createdAt: z.string(),
  version: z.string(),
});

export const manifestSchema = z.object({
  docId: z.string(),
  documentFile: z.string(),
  tocFile: z.string(),
  sectionsFile: z.string(),
  pagesDir: z.string(),
  nodesDir: z.string(),
  assetsDir: z.string(),
  stages: z.record(z.string(), z.enum(["pending", "done", "failed"])),
});

export type DocumentMetadataSchema = z.infer<typeof documentMetadataSchema>;
export type ManifestSchema = z.infer<typeof manifestSchema>;


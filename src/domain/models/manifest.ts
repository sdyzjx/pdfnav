export type StageStatus = "pending" | "done" | "failed";

export interface DocumentMetadata {
  docId: string;
  sourcePdf: string;
  sourceFilename: string;
  title: string;
  numPages: number | null;
  createdAt: string;
  version: string;
}

export interface Manifest {
  docId: string;
  documentFile: string;
  tocFile: string;
  sectionsFile: string;
  pagesDir: string;
  nodesDir: string;
  assetsDir: string;
  stages: Record<string, StageStatus>;
}


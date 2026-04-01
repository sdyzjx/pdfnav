import path from "node:path";

import type { DocumentMetadata, Manifest } from "../../domain/models/manifest";
import type { ArtifactStore } from "../ports/artifact-store";
import { sha256File } from "../../shared/utils/hash";

export interface InitDocumentInput {
  pdfPath: string;
  outputRoot: string;
}

export interface InitDocumentResult {
  outputDir: string;
  document: DocumentMetadata;
  manifest: Manifest;
}

export async function initDocument(
  artifactStore: ArtifactStore,
  input: InitDocumentInput,
): Promise<InitDocumentResult> {
  const hash = await sha256File(input.pdfPath);
  const shortHash = hash.slice(0, 12);
  const outputDir = path.resolve(input.outputRoot, `doc-${shortHash}`);

  await artifactStore.ensureDir(outputDir);
  await artifactStore.ensureDir(path.join(outputDir, "pages"));
  await artifactStore.ensureDir(path.join(outputDir, "nodes"));
  await artifactStore.ensureDir(path.join(outputDir, "assets", "images"));
  await artifactStore.ensureDir(path.join(outputDir, "assets", "page_renders"));
  await artifactStore.ensureDir(path.join(outputDir, "raw", "ocr"));
  await artifactStore.ensureDir(path.join(outputDir, "logs"));

  const document: DocumentMetadata = {
    docId: `sha256:${hash}`,
    sourcePdf: path.resolve(input.pdfPath),
    sourceFilename: path.basename(input.pdfPath),
    title: path.basename(input.pdfPath, path.extname(input.pdfPath)),
    numPages: null,
    createdAt: new Date().toISOString(),
    version: "0.1.0",
  };

  const manifest: Manifest = {
    docId: document.docId,
    documentFile: "document.json",
    tocFile: "toc.json",
    sectionsFile: "sections.json",
    pagesDir: "pages",
    nodesDir: "nodes",
    assetsDir: "assets",
    stages: {
      ingest: "done",
      render_pages: "pending",
      ocr_pages: "pending",
      normalize_pages: "pending",
      extract_images: "pending",
      build_toc: "pending",
      build_sections: "pending",
      build_content_nodes: "pending",
      finalize: "pending",
    },
  };

  await artifactStore.writeJson(path.join(outputDir, "document.json"), document);
  await artifactStore.writeJson(path.join(outputDir, "manifest.json"), manifest);
  await artifactStore.writeJson(path.join(outputDir, "toc.json"), []);
  await artifactStore.writeJson(path.join(outputDir, "sections.json"), []);

  return { outputDir, document, manifest };
}


import path from "node:path";

import type { ArtifactStore } from "../ports/artifact-store";
import type { PdfRenderer, RenderPageResult } from "../ports/pdf-renderer";
import type { DocumentMetadata, Manifest } from "../../domain/models/manifest";
import type { Logger } from "../ports/logger";

export interface RenderPagesInput {
  workspaceDir: string;
  document: DocumentMetadata;
  manifest: Manifest;
  startPage: number;
  endPage: number;
  dpi: number;
}

export interface RenderPagesResult {
  rendered: RenderPageResult[];
  pageCount: number;
}

export async function renderPages(
  artifactStore: ArtifactStore,
  renderer: PdfRenderer,
  logger: Logger,
  input: RenderPagesInput,
): Promise<RenderPagesResult> {
  const rendered: RenderPageResult[] = [];
  const pageCount = await renderer.getPageCount(input.document.sourcePdf);

  for (let page = input.startPage; page <= input.endPage; page += 1) {
    const outputPath = path.join(
      input.workspaceDir,
      input.manifest.assetsDir,
      "page_renders",
      `page-${String(page).padStart(4, "0")}.png`,
    );

    logger.info("Rendering page", { page, outputPath, dpi: input.dpi });

    const result = await renderer.renderPage({
      filePath: input.document.sourcePdf,
      pageNumber: page,
      outputPath,
      dpi: input.dpi,
    });

    rendered.push(result);
  }

  const nextDocument: DocumentMetadata = {
    ...input.document,
    numPages: pageCount,
  };
  const nextManifest: Manifest = {
    ...input.manifest,
    stages: {
      ...input.manifest.stages,
      render_pages: "done",
    },
  };

  await artifactStore.writeJson(path.join(input.workspaceDir, "document.json"), nextDocument);
  await artifactStore.writeJson(path.join(input.workspaceDir, "manifest.json"), nextManifest);

  return { rendered, pageCount };
}


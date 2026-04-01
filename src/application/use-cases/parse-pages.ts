import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import type { ArtifactStore } from "../ports/artifact-store";
import type { OcrProvider, RawOcrBatchResult } from "../ports/ocr-provider";
import type { DocumentMetadata, Manifest } from "../../domain/models/manifest";
import type { Logger } from "../ports/logger";

export interface ParsePagesInput {
  workspaceDir: string;
  document: DocumentMetadata;
  manifest: Manifest;
  startPage: number;
  endPage: number;
  timeoutMs?: number;
}

export interface ParsePagesResult {
  outputFile: string;
  pageCount: number;
  totalTokens: number | null;
}

export async function parsePages(
  artifactStore: ArtifactStore,
  ocrProvider: OcrProvider,
  logger: Logger,
  input: ParsePagesInput,
): Promise<ParsePagesResult> {
  await fs.access(input.document.sourcePdf);

  logger.info("Parsing rendered page images with BigModel OCR", {
    startPage: input.startPage,
    endPage: input.endPage,
  });

  const perPageResults: RawOcrBatchResult[] = [];

  for (let page = input.startPage; page <= input.endPage; page += 1) {
    const renderPath = path.join(
      input.workspaceDir,
      input.manifest.assetsDir,
      "page_renders",
      `page-${String(page).padStart(4, "0")}.png`,
    );

    await fs.access(renderPath);
    logger.info("Parsing rendered page image", { page, renderPath });

    const result = await ocrProvider.parsePageImage({
      filePath: renderPath,
      pageNumber: page,
      timeoutMs: input.timeoutMs,
    });
    perPageResults.push(result);
  }

  const result: RawOcrBatchResult = {
    id: `batch_${crypto.randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    model: perPageResults[0]?.model ?? "glm-ocr",
    md_results: perPageResults.map((entry) => entry.md_results).join("\n\n"),
    layout_details: perPageResults.flatMap((entry) => entry.layout_details),
    layout_visualization: perPageResults.flatMap((entry) => entry.layout_visualization ?? []),
    data_info: {
      num_pages: input.document.numPages ?? input.endPage,
      pages: perPageResults.flatMap((entry) => entry.data_info.pages),
    },
    usage: {
      prompt_tokens: perPageResults.reduce((sum, entry) => sum + (entry.usage?.prompt_tokens ?? 0), 0),
      completion_tokens: perPageResults.reduce(
        (sum, entry) => sum + (entry.usage?.completion_tokens ?? 0),
        0,
      ),
      total_tokens: perPageResults.reduce((sum, entry) => sum + (entry.usage?.total_tokens ?? 0), 0),
      prompt_tokens_details: {
        cached_tokens: perPageResults.reduce(
          (sum, entry) => sum + (entry.usage?.prompt_tokens_details?.cached_tokens ?? 0),
          0,
        ),
      },
    },
    request_id: `batch_req_${crypto.randomUUID()}`,
  };

  const outputFile = path.join(
    input.workspaceDir,
    "raw",
    "ocr",
    `batch-${String(input.startPage).padStart(4, "0")}-${String(input.endPage).padStart(4, "0")}.json`,
  );

  await artifactStore.writeJson(outputFile, result);

  const nextDocument: DocumentMetadata = {
    ...input.document,
    numPages: result.data_info.num_pages,
  };
  const nextManifest: Manifest = {
    ...input.manifest,
    stages: {
      ...input.manifest.stages,
      ocr_pages: "done",
    },
  };

  await artifactStore.writeJson(path.join(input.workspaceDir, "document.json"), nextDocument);
  await artifactStore.writeJson(path.join(input.workspaceDir, "manifest.json"), nextManifest);

  return {
    outputFile,
    pageCount: result.data_info.num_pages,
    totalTokens: result.usage?.total_tokens ?? null,
  };
}

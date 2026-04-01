import path from "node:path";

import type { ArtifactStore } from "../ports/artifact-store";
import type { RawOcrBatchResult } from "../ports/ocr-provider";
import type { Manifest } from "../../domain/models/manifest";
import type { PageBlock, PageLayout } from "../../domain/models/page";

export interface NormalizePagesInput {
  workspaceDir: string;
  manifest: Manifest;
  startPage: number;
  rawBatchFile: string;
}

export interface NormalizePagesResult {
  pages: PageLayout[];
}

function bboxToPx(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const alreadyAbsolute = bbox.some((value) => value > 1);
  if (alreadyAbsolute) {
    return [
      Math.round(bbox[0]),
      Math.round(bbox[1]),
      Math.round(bbox[2]),
      Math.round(bbox[3]),
    ];
  }

  return [
    Math.round(bbox[0] * width),
    Math.round(bbox[1] * height),
    Math.round(bbox[2] * width),
    Math.round(bbox[3] * height),
  ];
}

function bboxToNorm(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  const alreadyAbsolute = bbox.some((value) => value > 1);
  if (!alreadyAbsolute) {
    return bbox;
  }

  return [bbox[0] / width, bbox[1] / height, bbox[2] / width, bbox[3] / height];
}

function sortBlocks(blocks: PageBlock[]): PageBlock[] {
  return [...blocks].sort((left, right) => {
    const yDiff = left.bbox[1] - right.bbox[1];
    if (Math.abs(yDiff) > 24) {
      return yDiff;
    }

    return left.bbox[0] - right.bbox[0];
  });
}

export async function normalizePages(
  artifactStore: ArtifactStore,
  input: NormalizePagesInput,
): Promise<NormalizePagesResult> {
  const raw = await artifactStore.readJson<RawOcrBatchResult>(input.rawBatchFile);
  const pages: PageLayout[] = [];

  raw.layout_details.forEach((pageBlocks, pageOffset) => {
    const pageIndex = input.startPage + pageOffset;
    const pageInfo = raw.data_info.pages[pageOffset];

    const unsortedBlocks = pageBlocks.map<PageBlock>((block, blockOffset) => ({
      blockId: `p${pageIndex}-b${String(blockOffset + 1).padStart(4, "0")}`,
      type: block.label,
      bboxNorm: bboxToNorm(block.bbox_2d, pageInfo.width, pageInfo.height),
      bbox: bboxToPx(block.bbox_2d, pageInfo.width, pageInfo.height),
      content: block.content ?? null,
      readingOrder: block.index,
    }));

    const blocks = sortBlocks(unsortedBlocks).map((block, index) => ({
      ...block,
      readingOrder: index + 1,
    }));

    const page: PageLayout = {
      pageIndex,
      width: pageInfo.width,
      height: pageInfo.height,
      renderAssetId: `page-render-${pageIndex}`,
      blocks,
    };

    pages.push(page);
  });

  for (const page of pages) {
    const pageFile = path.join(
      input.workspaceDir,
      input.manifest.pagesDir,
      `page-${String(page.pageIndex).padStart(4, "0")}.json`,
    );
    await artifactStore.writeJson(pageFile, page);
  }

  const nextManifest: Manifest = {
    ...input.manifest,
    stages: {
      ...input.manifest.stages,
      normalize_pages: "done",
    },
  };
  await artifactStore.writeJson(path.join(input.workspaceDir, "manifest.json"), nextManifest);

  return { pages };
}

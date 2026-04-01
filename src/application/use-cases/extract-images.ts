import path from "node:path";

import type { ArtifactStore } from "../ports/artifact-store";
import type { Manifest } from "../../domain/models/manifest";
import type { PageLayout } from "../../domain/models/page";
import type { AssetRecord } from "../../domain/models/asset";
import type { Logger } from "../ports/logger";
import type { ImageCropper, ImageMetadata } from "../ports/image-cropper";

export interface ExtractImagesInput {
  workspaceDir: string;
  manifest: Manifest;
  startPage: number;
  endPage: number;
}

export interface ExtractImagesResult {
  assets: AssetRecord[];
}

function isValidPageBbox(
  bbox: [number, number, number, number],
  page: PageLayout,
): boolean {
  const toleranceX = Math.max(8, Math.round(page.width * 0.02));
  const toleranceY = Math.max(8, Math.round(page.height * 0.02));

  return (
    bbox[0] >= -toleranceX &&
    bbox[1] >= -toleranceY &&
    bbox[2] <= page.width + toleranceX &&
    bbox[3] <= page.height + toleranceY &&
    bbox[2] > bbox[0] &&
    bbox[3] > bbox[1]
  );
}

function toAbsoluteFromNorm(
  bboxNorm: [number, number, number, number],
  page: PageLayout,
): [number, number, number, number] {
  return [
    Math.round(bboxNorm[0] * page.width),
    Math.round(bboxNorm[1] * page.height),
    Math.round(bboxNorm[2] * page.width),
    Math.round(bboxNorm[3] * page.height),
  ];
}

function resolvePageBbox(block: PageLayout["blocks"][number], page: PageLayout): [number, number, number, number] {
  if (isValidPageBbox(block.bbox, page)) {
    return block.bbox;
  }

  const bboxNormLooksAbsolute = block.bboxNorm.some((value) => value > 1);
  if (bboxNormLooksAbsolute) {
    const candidate: [number, number, number, number] = [
      Math.round(block.bboxNorm[0]),
      Math.round(block.bboxNorm[1]),
      Math.round(block.bboxNorm[2]),
      Math.round(block.bboxNorm[3]),
    ];

    if (isValidPageBbox(candidate, page)) {
      return candidate;
    }
  }

  const candidate = toAbsoluteFromNorm(block.bboxNorm, page);
  if (isValidPageBbox(candidate, page)) {
    return candidate;
  }

  return block.bbox;
}

function scaleBbox(
  bbox: [number, number, number, number],
  page: PageLayout,
  renderMeta: ImageMetadata,
): { left: number; top: number; width: number; height: number } {
  const xScale = renderMeta.width / page.width;
  const yScale = renderMeta.height / page.height;
  const left = Math.max(0, Math.round(bbox[0] * xScale));
  const top = Math.max(0, Math.round(bbox[1] * yScale));
  const right = Math.min(renderMeta.width, Math.round(bbox[2] * xScale));
  const bottom = Math.min(renderMeta.height, Math.round(bbox[3] * yScale));

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export async function extractImages(
  artifactStore: ArtifactStore,
  imageCropper: ImageCropper,
  logger: Logger,
  input: ExtractImagesInput,
): Promise<ExtractImagesResult> {
  const assets: AssetRecord[] = [];

  for (let pageIndex = input.startPage; pageIndex <= input.endPage; pageIndex += 1) {
    const pageFile = path.join(
      input.workspaceDir,
      input.manifest.pagesDir,
      `page-${String(pageIndex).padStart(4, "0")}.json`,
    );
    const page = await artifactStore.readJson<PageLayout>(pageFile);
    const renderPath = path.join(
      input.workspaceDir,
      input.manifest.assetsDir,
      "page_renders",
      `page-${String(pageIndex).padStart(4, "0")}.png`,
    );
    const renderMeta = await imageCropper.getMetadata(renderPath);

    let imageCount = 0;
    for (const block of page.blocks) {
      if (block.type !== "image") {
        continue;
      }

      imageCount += 1;
      const assetId = `asset-img-p${pageIndex}-${String(imageCount).padStart(2, "0")}`;
      const outputRelPath = path.join(
        input.manifest.assetsDir,
        "images",
        `p${String(pageIndex).padStart(4, "0")}-img-${String(imageCount).padStart(2, "0")}.png`,
      );
      const outputPath = path.join(input.workspaceDir, outputRelPath);
      const pageBbox = resolvePageBbox(block, page);
      const crop = scaleBbox(pageBbox, page, renderMeta);

      logger.info("Cropping image asset from page render", {
        pageIndex,
        blockId: block.blockId,
        outputPath,
        pageBbox,
        crop,
      });

      await imageCropper.crop(renderPath, outputPath, crop);
      const metadata = await imageCropper.getMetadata(outputPath);

      block.assetId = assetId;
      assets.push({
        assetId,
        kind: "figure_image",
        pageIndex,
        path: outputRelPath,
        source: "page_crop",
        width: metadata.width,
        height: metadata.height,
      });
    }

    await artifactStore.writeJson(pageFile, page);
  }

  const assetsFile = path.join(input.workspaceDir, input.manifest.assetsDir, "assets.json");
  await artifactStore.writeJson(assetsFile, assets);

  const nextManifest: Manifest = {
    ...input.manifest,
    stages: {
      ...input.manifest.stages,
      extract_images: "done",
    },
  };
  await artifactStore.writeJson(path.join(input.workspaceDir, "manifest.json"), nextManifest);

  return { assets };
}

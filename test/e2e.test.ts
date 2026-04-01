import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { buildStructure } from "../src/application/use-cases/build-structure";
import { extractImages } from "../src/application/use-cases/extract-images";
import { initDocument } from "../src/application/use-cases/init-document";
import { normalizePages } from "../src/application/use-cases/normalize-pages";
import { renderPages } from "../src/application/use-cases/render-pages";
import { LocalFsArtifactStore } from "../src/infrastructure/adapters/storage/local-fs-artifact-store";
import { PdftoppmPdfRenderer } from "../src/infrastructure/adapters/pdf/pdftoppm-pdf-renderer";
import { SharpImageCropper } from "../src/infrastructure/adapters/storage/sharp-image-cropper";
import { PinoLoggerAdapter } from "../src/infrastructure/adapters/logger/pino-logger-adapter";
import type { Manifest, DocumentMetadata } from "../src/domain/models/manifest";
import type { Section, TocItem } from "../src/domain/models/section";
import type { PageLayout } from "../src/domain/models/page";
import { createSamplePdf, createSampleRawBatch } from "./helpers/sample-data";
import { flattenToc, queryNodes } from "../src/application/services/workspace-reader";

const tmpRoot = path.join(os.tmpdir(), `pdfnav-test-${Date.now()}`);

before(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
});

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("end-to-end workspace build produces pages, assets, toc, sections, and queryable nodes", async () => {
  const pdfPath = path.join(tmpRoot, "sample.pdf");
  await createSamplePdf(pdfPath);

  const store = new LocalFsArtifactStore();
  const logger = new PinoLoggerAdapter();
  const renderer = new PdftoppmPdfRenderer();
  const cropper = new SharpImageCropper();

  const init = await initDocument(store, {
    pdfPath,
    outputRoot: path.join(tmpRoot, "out"),
  });

  const renderResult = await renderPages(store, renderer, logger, {
    workspaceDir: init.outputDir,
    document: init.document,
    manifest: init.manifest,
    startPage: 1,
    endPage: 2,
    dpi: 160,
  });

  assert.equal(renderResult.pageCount, 2);

  const rawBatchPath = path.join(init.outputDir, "raw", "ocr", "batch-0001-0002.json");
  await store.writeJson(rawBatchPath, createSampleRawBatch());

  const manifestAfterRender = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));
  await normalizePages(store, {
    workspaceDir: init.outputDir,
    manifest: manifestAfterRender,
    startPage: 1,
    rawBatchFile: rawBatchPath,
  });

  const manifestAfterNormalize = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));
  await extractImages(store, cropper, logger, {
    workspaceDir: init.outputDir,
    manifest: manifestAfterNormalize,
    startPage: 1,
    endPage: 2,
  });

  const structure = await buildStructure(store, { workspaceDir: init.outputDir });

  assert.equal(structure.sectionCount, 3);
  assert.equal(structure.pageCount, 2);
  assert.ok(structure.nodeCount >= 5);

  const toc = await store.readJson<TocItem[]>(path.join(init.outputDir, "toc.json"));
  const sections = await store.readJson<Section[]>(path.join(init.outputDir, "sections.json"));
  const page2 = await store.readJson<PageLayout>(path.join(init.outputDir, "pages", "page-0002.json"));
  const assets = await store.readJson<Array<{ assetId: string }>>(
    path.join(init.outputDir, "assets", "assets.json"),
  );
  const document = await store.readJson<DocumentMetadata>(path.join(init.outputDir, "document.json"));
  const finalManifest = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));

  assert.equal(document.numPages, 2);
  assert.equal(flattenToc(toc).length, 3);
  assert.equal(sections.length, 3);
  assert.equal(assets.length, 1);
  assert.equal(page2.blocks.find((block) => block.type === "image")?.assetId, "asset-img-p2-01");
  assert.equal(finalManifest.stages.build_toc, "done");
  assert.equal(finalManifest.stages.build_sections, "done");
  assert.equal(finalManifest.stages.build_content_nodes, "done");

  const queryMatches = await queryNodes(store, init.outputDir, {
    section: "2",
    keyword: "method",
    limit: 10,
  });
  assert.equal(queryMatches.length, 2);
  assert.equal(queryMatches[0]?.section.sectionId, "sec-2");
});

test("extractImages recovers from legacy malformed bbox values in page JSON", async () => {
  const pdfPath = path.join(tmpRoot, "legacy-sample.pdf");
  await createSamplePdf(pdfPath);

  const store = new LocalFsArtifactStore();
  const logger = new PinoLoggerAdapter();
  const renderer = new PdftoppmPdfRenderer();
  const cropper = new SharpImageCropper();

  const init = await initDocument(store, {
    pdfPath,
    outputRoot: path.join(tmpRoot, "legacy-out"),
  });

  await renderPages(store, renderer, logger, {
    workspaceDir: init.outputDir,
    document: init.document,
    manifest: init.manifest,
    startPage: 1,
    endPage: 2,
    dpi: 160,
  });

  const rawBatchPath = path.join(init.outputDir, "raw", "ocr", "batch-0001-0002.json");
  await store.writeJson(rawBatchPath, createSampleRawBatch());

  const manifestAfterRender = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));
  await normalizePages(store, {
    workspaceDir: init.outputDir,
    manifest: manifestAfterRender,
    startPage: 1,
    rawBatchFile: rawBatchPath,
  });

  const page2Path = path.join(init.outputDir, "pages", "page-0002.json");
  const page2 = await store.readJson<PageLayout>(page2Path);
  const imageBlock = page2.blocks.find((block) => block.type === "image");
  assert.ok(imageBlock);

  imageBlock!.bbox = [54000, 162000, 270000, 288000];
  imageBlock!.bboxNorm = [90, 270, 450, 480];
  await store.writeJson(page2Path, page2);

  const manifestAfterNormalize = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));
  const result = await extractImages(store, cropper, logger, {
    workspaceDir: init.outputDir,
    manifest: manifestAfterNormalize,
    startPage: 2,
    endPage: 2,
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0]?.assetId, "asset-img-p2-01");
});

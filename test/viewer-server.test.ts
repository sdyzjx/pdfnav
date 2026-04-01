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
import { FileConfigRepository } from "../src/infrastructure/adapters/config/file-config-repository";
import { PinoLoggerAdapter } from "../src/infrastructure/adapters/logger/pino-logger-adapter";
import { PdftoppmPdfRenderer } from "../src/infrastructure/adapters/pdf/pdftoppm-pdf-renderer";
import { startWorkspaceViewerServer } from "../src/infrastructure/adapters/server/workspace-viewer-server";
import { LocalFsArtifactStore } from "../src/infrastructure/adapters/storage/local-fs-artifact-store";
import { SharpImageCropper } from "../src/infrastructure/adapters/storage/sharp-image-cropper";
import type { Manifest } from "../src/domain/models/manifest";
import { createSamplePdf, createSampleRawBatch } from "./helpers/sample-data";

const tmpRoot = path.join(os.tmpdir(), `pdfnav-viewer-test-${Date.now()}`);

before(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
});

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("workspace viewer serves parsed workspace, config UI, and static assets", async () => {
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

  const manifestAfterNormalize = await store.readJson<Manifest>(path.join(init.outputDir, "manifest.json"));
  await extractImages(store, cropper, logger, {
    workspaceDir: init.outputDir,
    manifest: manifestAfterNormalize,
    startPage: 1,
    endPage: 2,
  });

  await buildStructure(store, { workspaceDir: init.outputDir });

  const configRepository = new FileConfigRepository(path.join(tmpRoot, "config.json"));
  const started = await startWorkspaceViewerServer(store, configRepository, logger, {
    workspaceDir: init.outputDir,
    port: 0,
    host: "127.0.0.1",
  });

  try {
    const rootHtml = await fetch(`${started.url}/`).then((res) => res.text());
    assert.match(rootHtml, /Parsed Workspace/);
    assert.match(rootHtml, /viewer\.js/);
    assert.match(rootHtml, /themeToggleButton/);

    const bookHtml = await fetch(`${started.url}/book`).then((res) => res.text());
    assert.match(bookHtml, /阅读模式/);
    assert.match(bookHtml, /bookThemeToggle/);

    const configHtml = await fetch(`${started.url}/config`).then((res) => res.text());
    assert.match(configHtml, /Configuration/);

    const meta = await fetch(`${started.url}/api/viewer/meta`).then((res) => res.json());
    assert.equal(meta.ok, true);
    assert.equal(meta.summary.pageCount, 2);
    assert.equal(meta.summary.sectionCount, 3);

    const section = await fetch(`${started.url}/api/viewer/section?section=2`).then((res) =>
      res.json(),
    );
    assert.equal(section.ok, true);
    assert.equal(section.section.sectionId, "sec-2");
    assert.equal(section.pages.length, 1);
    assert.equal(section.nodes.some((node: { type: string }) => node.type === "figure"), true);

    const page = await fetch(`${started.url}/api/viewer/page?page=2`).then((res) => res.json());
    assert.equal(page.ok, true);
    assert.match(page.page.renderUrl, /page-0002\.png$/);
    assert.equal(
      page.page.blocks.some(
        (block: { type: string; assetUrl?: string | null }) =>
          block.type === "image" && typeof block.assetUrl === "string",
      ),
      true,
    );

    const query = await fetch(`${started.url}/api/viewer/query?keyword=method`).then((res) =>
      res.json(),
    );
    assert.equal(query.ok, true);
    assert.equal(query.matches.length > 0, true);

    const assetResponse = await fetch(`${started.url}/workspace/assets/page_renders/page-0002.png`);
    assert.equal(assetResponse.ok, true);

    const configPayload = await fetch(`${started.url}/api/config`).then((res) => res.json());
    assert.equal(configPayload.ok ?? true, true);
    assert.equal(typeof configPayload.configPath, "string");
  } finally {
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

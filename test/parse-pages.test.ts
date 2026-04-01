import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { parsePages } from "../src/application/use-cases/parse-pages";
import { FileConfigRepository } from "../src/infrastructure/adapters/config/file-config-repository";
import { BigModelOcrAdapter } from "../src/infrastructure/adapters/ocr/bigmodel-ocr-adapter";
import { getConfig } from "../src/application/use-cases/get-config";
import { LocalFsArtifactStore } from "../src/infrastructure/adapters/storage/local-fs-artifact-store";
import { PinoLoggerAdapter } from "../src/infrastructure/adapters/logger/pino-logger-adapter";
import { createSamplePdf, createSampleRawBatch } from "./helpers/sample-data";
import { initDocument } from "../src/application/use-cases/init-document";
import { renderPages } from "../src/application/use-cases/render-pages";
import { PdftoppmPdfRenderer } from "../src/infrastructure/adapters/pdf/pdftoppm-pdf-renderer";

const tmpRoot = path.join(os.tmpdir(), `pdfnav-parse-test-${Date.now()}`);
let server: http.Server;
let baseUrl = "";

before(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });

  server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/layout_parsing") {
      res.statusCode = 404;
      res.end();
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    const payload = JSON.parse(body);
    assert.equal(payload.model, "glm-ocr");
    assert.equal("start_page_id" in payload, false);
    assert.equal("end_page_id" in payload, false);
    assert.match(String(payload.file), /^data:image\/png;base64,/);

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(createSampleRawBatch()));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Unable to resolve mock server address.");
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("parsePages writes raw OCR batch output using configured base URL", async () => {
  const pdfPath = path.join(tmpRoot, "sample.pdf");
  const configPath = path.join(tmpRoot, "config.json");
  await createSamplePdf(pdfPath);

  const configRepo = new FileConfigRepository(configPath);
  await configRepo.save({
    version: "0.1.0",
    providers: {
      bigmodel: {
        apiKey: "test-key",
        baseUrl,
      },
    },
    updatedAt: new Date().toISOString(),
  });

  const config = await getConfig(configRepo);
  const store = new LocalFsArtifactStore();
  const logger = new PinoLoggerAdapter();
  const init = await initDocument(store, {
    pdfPath,
    outputRoot: path.join(tmpRoot, "out"),
  });
  await renderPages(store, new PdftoppmPdfRenderer(), logger, {
    workspaceDir: init.outputDir,
    document: init.document,
    manifest: init.manifest,
    startPage: 1,
    endPage: 2,
    dpi: 160,
  });

  const result = await parsePages(store, new BigModelOcrAdapter(config), logger, {
    workspaceDir: init.outputDir,
    document: init.document,
    manifest: init.manifest,
    startPage: 1,
    endPage: 2,
  });

  const saved = await store.readJson<{ usage?: { total_tokens?: number } }>(result.outputFile);
  assert.equal(result.pageCount, 2);
  assert.equal(result.totalTokens, 60);
  assert.equal(saved.usage?.total_tokens, 60);
});

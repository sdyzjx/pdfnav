import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import type { AppConfig } from "../../../domain/models/config";
import type {
  OcrProvider,
  ParsePageImageInput,
  RawOcrBatchResult,
} from "../../../application/ports/ocr-provider";

export class BigModelOcrAdapter implements OcrProvider {
  constructor(private readonly config: AppConfig) {}

  async parsePageImage(input: ParsePageImageInput): Promise<RawOcrBatchResult> {
    if (!this.config.providers.bigmodel.apiKey) {
      throw new Error("BigModel API key is empty. Set it via `pdfnav config web` or `pdfnav config set-api-key`.");
    }

    const fileBuffer = await fs.readFile(input.filePath);
    const ext = path.extname(input.filePath).toLowerCase();
    const mimeType =
      ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
    const fileBase64 = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
    const requestId = input.requestId ?? `req_${crypto.randomUUID()}`;
    const endpoint = `${this.config.providers.bigmodel.baseUrl.replace(/\/$/, "")}/layout_parsing`;
    const timeoutMs = input.timeoutMs ?? 120_000;
    const signal = AbortSignal.timeout(timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.providers.bigmodel.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-ocr",
          file: fileBase64,
          request_id: requestId,
          return_crop_images: false,
          need_layout_visualization: false,
        }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(
          `BigModel layout_parsing timed out after ${timeoutMs}ms for rendered page ${input.pageNumber}. ` +
            "The service did not return any response in time. Try a larger timeout or inspect this page image manually.",
        );
      }

      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`BigModel layout_parsing failed with ${response.status}: ${body}`);
    }

    return (await response.json()) as RawOcrBatchResult;
  }
}

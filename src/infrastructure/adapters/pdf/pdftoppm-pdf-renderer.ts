import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  PdfRenderer,
  RenderPageInput,
  RenderPageResult,
} from "../../../application/ports/pdf-renderer";

const execFileAsync = promisify(execFile);

function parsePageCount(stdout: string): number {
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) {
    throw new Error("Unable to determine PDF page count from pdfinfo output.");
  }

  return Number(match[1]);
}

function parsePageSize(stdout: string): { width: number; height: number } | null {
  const match = stdout.match(/^Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);
  if (match) {
    return {
      width: Math.round(Number(match[1])),
      height: Math.round(Number(match[2])),
    };
  }

  const fallback = stdout.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);
  if (!fallback) {
    return null;
  }

  return {
    width: Math.round(Number(fallback[1])),
    height: Math.round(Number(fallback[2])),
  };
}

export class PdftoppmPdfRenderer implements PdfRenderer {
  async getPageCount(filePath: string): Promise<number> {
    const { stdout } = await execFileAsync("pdfinfo", [filePath]);
    return parsePageCount(stdout);
  }

  async renderPage(input: RenderPageInput): Promise<RenderPageResult> {
    await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
    const outputPrefix = input.outputPath.replace(/\.png$/i, "");

    await execFileAsync("pdftoppm", [
      "-png",
      "-singlefile",
      "-r",
      String(input.dpi),
      "-f",
      String(input.pageNumber),
      "-l",
      String(input.pageNumber),
      input.filePath,
      outputPrefix,
    ]);

    const { stdout } = await execFileAsync("pdfinfo", [
      "-f",
      String(input.pageNumber),
      "-l",
      String(input.pageNumber),
      input.filePath,
    ]);
    const size = parsePageSize(stdout);

    return {
      pageNumber: input.pageNumber,
      outputPath: input.outputPath,
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }
}


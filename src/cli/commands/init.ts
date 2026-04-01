import fs from "node:fs/promises";
import path from "node:path";

import { Command } from "commander";

import { initDocument } from "../../application/use-cases/init-document";
import { LocalFsArtifactStore } from "../../infrastructure/adapters/storage/local-fs-artifact-store";
import { printJson } from "../presenters/json-presenter";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Create a structured output workspace for a PDF")
    .argument("<pdf>", "Path to the source PDF")
    .option("-o, --out <dir>", "Output root directory", path.resolve(process.cwd(), "output"))
    .action(async (pdf: string, options: { out: string }) => {
      const pdfPath = path.resolve(pdf);
      await fs.access(pdfPath);

      const store = new LocalFsArtifactStore();
      const result = await initDocument(store, {
        pdfPath,
        outputRoot: path.resolve(options.out),
      });

      printJson({
        ok: true,
        docId: result.document.docId,
        outputDir: result.outputDir,
        manifest: path.join(result.outputDir, "manifest.json"),
      });
    });
}


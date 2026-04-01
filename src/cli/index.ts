#!/usr/bin/env node
import { Command } from "commander";

import { createBuildStructureCommand } from "./commands/build-structure";
import { createConfigCommand } from "./commands/config";
import { createExtractImagesCommand } from "./commands/extract-images";
import { createInitCommand } from "./commands/init";
import { createInspectPageCommand } from "./commands/inspect-page";
import { createInspectSectionCommand } from "./commands/inspect-section";
import { createInspectTocCommand } from "./commands/inspect-toc";
import { createNormalizePagesCommand } from "./commands/normalize-pages";
import { createParsePagesCommand } from "./commands/parse-pages";
import { createQueryCommand } from "./commands/query";
import { createRenderPagesCommand } from "./commands/render-pages";
import { createViewCommand } from "./commands/view";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("pdfnav")
    .description("Structured PDF reader for agents")
    .version("0.1.0");

  program.addCommand(createConfigCommand());
  program.addCommand(createInitCommand());
  program.addCommand(createRenderPagesCommand());
  program.addCommand(createParsePagesCommand());
  program.addCommand(createNormalizePagesCommand());
  program.addCommand(createBuildStructureCommand());
  program.addCommand(createExtractImagesCommand());
  program.addCommand(createInspectTocCommand());
  program.addCommand(createInspectSectionCommand());
  program.addCommand(createInspectPageCommand());
  program.addCommand(createQueryCommand());
  program.addCommand(createViewCommand());

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

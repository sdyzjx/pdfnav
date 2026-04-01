import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactStore } from "../ports/artifact-store";
import type { Manifest } from "../../domain/models/manifest";
import type { PageLayout } from "../../domain/models/page";
import { DeterministicStructureBuilder } from "../../infrastructure/adapters/section/deterministic-structure-builder";

export interface BuildStructureInput {
  workspaceDir: string;
}

export interface BuildStructureResult {
  tocFile: string;
  sectionsFile: string;
  nodeFiles: string[];
  sectionCount: number;
  nodeCount: number;
  pageCount: number;
}

async function loadPageLayouts(
  artifactStore: ArtifactStore,
  workspaceDir: string,
): Promise<PageLayout[]> {
  const pagesDir = path.join(workspaceDir, "pages");
  const entries = await fs.readdir(pagesDir, { withFileTypes: true });
  const pageFiles = entries
    .filter((entry) => entry.isFile() && /^page-\d+\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const pages: PageLayout[] = [];
  for (const pageFile of pageFiles) {
    const page = await artifactStore.readJson<PageLayout>(path.join(pagesDir, pageFile));
    pages.push(page);
  }

  return pages.sort((left, right) => left.pageIndex - right.pageIndex);
}

export async function buildStructure(
  artifactStore: ArtifactStore,
  input: BuildStructureInput,
): Promise<BuildStructureResult> {
  const workspaceDir = path.resolve(input.workspaceDir);
  const manifest = await artifactStore.readJson<Manifest>(path.join(workspaceDir, "manifest.json"));
  const pages = await loadPageLayouts(artifactStore, workspaceDir);

  if (pages.length === 0) {
    throw new Error(`No normalized page JSON files found in ${path.join(workspaceDir, "pages")}`);
  }

  const builder = new DeterministicStructureBuilder();
  const result = builder.build(pages);

  const tocFile = path.join(workspaceDir, manifest.tocFile);
  const sectionsFile = path.join(workspaceDir, manifest.sectionsFile);

  await artifactStore.writeJson(tocFile, result.toc);
  await artifactStore.writeJson(sectionsFile, result.sections);

  const nodeFiles: string[] = [];
  let nodeCount = 0;

  for (const section of result.sections) {
    const nodes = result.nodesBySection.get(section.sectionId) ?? [];
    const body = nodes.map((node) => JSON.stringify(node)).join("\n");
    const filePath = path.join(workspaceDir, section.nodeFile);
    await artifactStore.writeBuffer(filePath, Buffer.from(`${body}\n`, "utf8"));
    nodeFiles.push(filePath);
    nodeCount += nodes.length;
  }

  const nextManifest: Manifest = {
    ...manifest,
    stages: {
      ...manifest.stages,
      build_toc: "done",
      build_sections: "done",
      build_content_nodes: "done",
      finalize: "done",
    },
  };
  await artifactStore.writeJson(path.join(workspaceDir, "manifest.json"), nextManifest);

  return {
    tocFile,
    sectionsFile,
    nodeFiles,
    sectionCount: result.sections.length,
    nodeCount,
    pageCount: pages.length,
  };
}


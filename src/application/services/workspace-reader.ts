import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactStore } from "../ports/artifact-store";
import type { Manifest } from "../../domain/models/manifest";
import type { DocumentMetadata } from "../../domain/models/manifest";
import type { TocItem, Section } from "../../domain/models/section";
import type { ContentNode, ContentNodeType } from "../../domain/models/content-node";
import type { PageLayout } from "../../domain/models/page";
import type { AssetRecord } from "../../domain/models/asset";

export interface LoadedSection {
  section: Section;
  nodes: ContentNode[];
}

export function flattenToc(items: TocItem[], acc: TocItem[] = []): TocItem[] {
  for (const item of items) {
    acc.push(item);
    flattenToc(item.children, acc);
  }

  return acc;
}

export async function loadManifest(
  artifactStore: ArtifactStore,
  workspaceDir: string,
): Promise<Manifest> {
  return artifactStore.readJson<Manifest>(path.join(workspaceDir, "manifest.json"));
}

export async function loadDocument(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  manifest: Manifest,
): Promise<DocumentMetadata> {
  return artifactStore.readJson<DocumentMetadata>(path.join(workspaceDir, manifest.documentFile));
}

export async function loadToc(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  manifest: Manifest,
): Promise<TocItem[]> {
  return artifactStore.readJson<TocItem[]>(path.join(workspaceDir, manifest.tocFile));
}

export async function loadSections(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  manifest: Manifest,
): Promise<Section[]> {
  return artifactStore.readJson<Section[]>(path.join(workspaceDir, manifest.sectionsFile));
}

export async function loadPage(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  manifest: Manifest,
  pageNumber: number,
): Promise<PageLayout> {
  return artifactStore.readJson<PageLayout>(
    path.join(workspaceDir, manifest.pagesDir, `page-${String(pageNumber).padStart(4, "0")}.json`),
  );
}

export async function loadSectionNodes(
  workspaceDir: string,
  section: Section,
): Promise<ContentNode[]> {
  const filePath = path.join(workspaceDir, section.nodeFile);
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => JSON.parse(line) as ContentNode);
}

export async function loadAssets(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  manifest: Manifest,
): Promise<AssetRecord[]> {
  const assetIndexPath = path.join(workspaceDir, manifest.assetsDir, "assets.json");
  try {
    return await artifactStore.readJson<AssetRecord[]>(assetIndexPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      return [];
    }
    throw error;
  }
}

export async function loadAllSectionNodes(
  workspaceDir: string,
  sections: Section[],
): Promise<LoadedSection[]> {
  const loaded: LoadedSection[] = [];

  for (const section of sections) {
    loaded.push({
      section,
      nodes: await loadSectionNodes(workspaceDir, section),
    });
  }

  return loaded;
}

export function findSection(
  sections: Section[],
  toc: TocItem[],
  needle: string,
): Section | null {
  const normalizedNeedle = needle.trim().toLowerCase();
  const tocFlat = flattenToc(toc);

  const tocMatch = tocFlat.find((item) => {
    const ordinal = item.ordinal?.toLowerCase();
    return (
      item.sectionId.toLowerCase() === normalizedNeedle ||
      item.title.toLowerCase() === normalizedNeedle ||
      `${item.ordinal ?? ""} ${item.title}`.trim().toLowerCase() === normalizedNeedle ||
      ordinal === normalizedNeedle
    );
  });

  if (tocMatch) {
    return sections.find((section) => section.sectionId === tocMatch.sectionId) ?? null;
  }

  return (
    sections.find((section) => {
      const ordinal = section.ordinal?.toLowerCase();
      return (
        section.sectionId.toLowerCase() === normalizedNeedle ||
        section.title.toLowerCase() === normalizedNeedle ||
        `${section.ordinal ?? ""} ${section.title}`.trim().toLowerCase() === normalizedNeedle ||
        ordinal === normalizedNeedle
      );
    }) ?? null
  );
}

export interface QueryOptions {
  section?: string;
  type?: ContentNodeType;
  keyword?: string;
  page?: number;
  limit?: number;
}

export interface QueryMatch {
  section: Section;
  node: ContentNode;
}

export async function queryNodes(
  artifactStore: ArtifactStore,
  workspaceDir: string,
  options: QueryOptions,
): Promise<QueryMatch[]> {
  const manifest = await loadManifest(artifactStore, workspaceDir);
  const toc = await loadToc(artifactStore, workspaceDir, manifest);
  const sections = await loadSections(artifactStore, workspaceDir, manifest);
  const loadedSections = await loadAllSectionNodes(workspaceDir, sections);
  const targetSection = options.section ? findSection(sections, toc, options.section) : null;
  const keyword = options.keyword?.trim().toLowerCase();
  const limit = options.limit ?? 20;

  const matches: QueryMatch[] = [];

  for (const loaded of loadedSections) {
    if (targetSection && loaded.section.sectionId !== targetSection.sectionId) {
      continue;
    }

    for (const node of loaded.nodes) {
      if (options.type && node.type !== options.type) {
        continue;
      }

      if (options.page && node.pageIndex !== options.page) {
        continue;
      }

      if (keyword) {
        const haystack =
          node.type === "heading"
            ? `${node.title ?? ""} ${node.text ?? ""} ${node.ordinal ?? ""}`.toLowerCase()
            : `${node.text ?? ""} ${node.ordinal ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          continue;
        }
      }

      matches.push({ section: loaded.section, node });
      if (matches.length >= limit) {
        return matches;
      }
    }
  }

  return matches;
}

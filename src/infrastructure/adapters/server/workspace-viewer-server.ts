import http from "node:http";
import path from "node:path";

import express from "express";

import {
  findSection,
  loadAssets,
  loadDocument,
  loadManifest,
  loadPage,
  loadSectionNodes,
  loadSections,
  loadToc,
  queryNodes,
} from "../../../application/services/workspace-reader";
import type { ConfigRepository } from "../../../application/ports/config-repository";
import type { Logger } from "../../../application/ports/logger";
import type { ArtifactStore } from "../../../application/ports/artifact-store";
import type { AssetRecord } from "../../../domain/models/asset";
import type { ContentNodeType } from "../../../domain/models/content-node";
import { registerConfigApi } from "./config-api";
import { resolveWebRoot } from "./web-root";

export interface StartWorkspaceViewerServerInput {
  workspaceDir: string;
  port: number;
  host?: string;
}

export interface StartedWorkspaceViewerServer {
  app: express.Express;
  server: http.Server;
  url: string;
}

function padPage(pageIndex: number): string {
  return String(pageIndex).padStart(4, "0");
}

function toWebPath(value: string): string {
  return value.split(path.sep).join("/");
}

function buildPageRenderUrl(pageIndex: number): string {
  return `/workspace/assets/page_renders/page-${padPage(pageIndex)}.png`;
}

function buildAssetUrl(asset: AssetRecord | null | undefined, assetsDir: string): string | null {
  if (!asset) {
    return null;
  }

  const normalizedPath = toWebPath(asset.path);
  const normalizedAssetsDir = toWebPath(assetsDir);
  const prefix = `${normalizedAssetsDir}/`;
  const relativePath = normalizedPath.startsWith(prefix)
    ? normalizedPath.slice(prefix.length)
    : normalizedPath;

  return `/workspace/assets/${relativePath}`;
}

function parseNodeType(value: unknown): ContentNodeType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const allowed: ContentNodeType[] = ["heading", "paragraph", "formula", "figure", "table"];
  return allowed.includes(value as ContentNodeType) ? (value as ContentNodeType) : undefined;
}

async function readWorkspaceSnapshot(artifactStore: ArtifactStore, workspaceDir: string) {
  const manifest = await loadManifest(artifactStore, workspaceDir);
  const document = await loadDocument(artifactStore, workspaceDir, manifest);
  const toc = await loadToc(artifactStore, workspaceDir, manifest);
  const sections = await loadSections(artifactStore, workspaceDir, manifest);
  const assets = await loadAssets(artifactStore, workspaceDir, manifest);
  const assetIndex = new Map(assets.map((asset) => [asset.assetId, asset] as const));

  return {
    manifest,
    document,
    toc,
    sections,
    assets,
    assetIndex,
  };
}

function enrichNode(
  node: Awaited<ReturnType<typeof loadSectionNodes>>[number],
  assetIndex: Map<string, AssetRecord>,
  assetsDir: string,
) {
  const asset = node.assetId ? assetIndex.get(node.assetId) ?? null : null;

  return {
    ...node,
    assetUrl: buildAssetUrl(asset, assetsDir),
    pageRenderUrl: buildPageRenderUrl(node.pageIndex),
  };
}

export async function createWorkspaceViewerApp(
  artifactStore: ArtifactStore,
  configRepository: ConfigRepository,
  logger: Logger,
  input: StartWorkspaceViewerServerInput,
): Promise<express.Express> {
  const app = express();
  const webRoot = resolveWebRoot();
  const resolvedWorkspaceDir = path.resolve(input.workspaceDir);

  const initialManifest = await loadManifest(artifactStore, resolvedWorkspaceDir);
  const initialDocument = await loadDocument(artifactStore, resolvedWorkspaceDir, initialManifest);

  app.use(express.json());
  registerConfigApi(app, configRepository, logger);
  app.use(
    "/workspace/assets",
    express.static(path.join(resolvedWorkspaceDir, initialManifest.assetsDir), {
      fallthrough: false,
      index: false,
    }),
  );
  app.use(express.static(webRoot, { index: false }));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(webRoot, "viewer.html"));
  });

  app.get("/viewer", (_req, res) => {
    res.sendFile(path.join(webRoot, "viewer.html"));
  });

  app.get("/book", (_req, res) => {
    res.sendFile(path.join(webRoot, "book.html"));
  });

  app.get("/config", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });

  app.get("/workspace/source.pdf", (_req, res) => {
    res.sendFile(initialDocument.sourcePdf);
  });

  app.get("/api/viewer/meta", async (_req, res, next) => {
    try {
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      res.json({
        ok: true,
        workspaceDir: resolvedWorkspaceDir,
        document: snapshot.document,
        manifest: snapshot.manifest,
        summary: {
          sectionCount: snapshot.sections.length,
          assetCount: snapshot.assets.length,
          pageCount: snapshot.document.numPages ?? 0,
        },
        sourcePdfUrl: "/workspace/source.pdf",
        defaultSectionId: snapshot.sections[0]?.sectionId ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/toc", async (_req, res, next) => {
    try {
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      res.json({
        ok: true,
        toc: snapshot.toc,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/sections", async (_req, res, next) => {
    try {
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      res.json({
        ok: true,
        sections: snapshot.sections,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/assets", async (_req, res, next) => {
    try {
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      const assets = snapshot.assets.map((asset) => ({
        ...asset,
        url: buildAssetUrl(asset, snapshot.manifest.assetsDir),
      }));

      res.json({
        ok: true,
        assets,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/section", async (req, res, next) => {
    try {
      const needle = String(req.query.section ?? "").trim();
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      const fallbackSection = snapshot.sections[0] ?? null;
      const section = needle
        ? findSection(snapshot.sections, snapshot.toc, needle)
        : fallbackSection;

      if (!section) {
        res.status(404).json({
          ok: false,
          error: needle ? `Section not found: ${needle}` : "No sections available",
        });
        return;
      }

      const nodes = await loadSectionNodes(resolvedWorkspaceDir, section);
      const pages = [];
      for (let pageIndex = section.pageRange[0]; pageIndex <= section.pageRange[1]; pageIndex += 1) {
        pages.push({
          pageIndex,
          renderUrl: buildPageRenderUrl(pageIndex),
        });
      }

      res.json({
        ok: true,
        section,
        nodes: nodes.map((node) => enrichNode(node, snapshot.assetIndex, snapshot.manifest.assetsDir)),
        pages,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/page", async (req, res, next) => {
    try {
      const page = Number(req.query.page);
      if (!Number.isInteger(page) || page < 1) {
        res.status(400).json({
          ok: false,
          error: "A valid ?page=<number> is required.",
        });
        return;
      }

      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      const layout = await loadPage(artifactStore, resolvedWorkspaceDir, snapshot.manifest, page);

      res.json({
        ok: true,
        page: {
          ...layout,
          renderUrl: buildPageRenderUrl(page),
          blocks: layout.blocks.map((block) => ({
            ...block,
            assetUrl: block.assetId
              ? buildAssetUrl(snapshot.assetIndex.get(block.assetId) ?? null, snapshot.manifest.assetsDir)
              : null,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/viewer/query", async (req, res, next) => {
    try {
      const snapshot = await readWorkspaceSnapshot(artifactStore, resolvedWorkspaceDir);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const matches = await queryNodes(artifactStore, resolvedWorkspaceDir, {
        section: typeof req.query.section === "string" ? req.query.section : undefined,
        type: parseNodeType(req.query.type),
        keyword: typeof req.query.keyword === "string" ? req.query.keyword : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      });

      res.json({
        ok: true,
        matches: matches.map((match) => ({
          section: match.section,
          node: enrichNode(match.node, snapshot.assetIndex, snapshot.manifest.assetsDir),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Workspace viewer request failed", { error: err.message });
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  });

  return app;
}

export async function startWorkspaceViewerServer(
  artifactStore: ArtifactStore,
  configRepository: ConfigRepository,
  logger: Logger,
  input: StartWorkspaceViewerServerInput,
): Promise<StartedWorkspaceViewerServer> {
  const app = await createWorkspaceViewerApp(artifactStore, configRepository, logger, input);
  const desiredHost = input.host ?? "127.0.0.1";

  return await new Promise<StartedWorkspaceViewerServer>((resolve, reject) => {
    const server = app.listen(input.port, desiredHost, () => {
      const address = server.address();
      const actualPort =
        address && typeof address !== "string" && typeof address.port === "number"
          ? address.port
          : input.port;
      const actualHost =
        address && typeof address !== "string" && address.address
          ? address.address
          : desiredHost;
      const url = `http://${actualHost}:${actualPort}`;
      logger.info("Workspace viewer started", {
        workspaceDir: path.resolve(input.workspaceDir),
        address,
        url,
      });
      resolve({ app, server, url });
    });

    server.on("error", reject);
  });
}

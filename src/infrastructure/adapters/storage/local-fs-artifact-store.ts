import fs from "node:fs/promises";
import path from "node:path";

import type { ArtifactStore } from "../../../application/ports/artifact-store";

export class LocalFsArtifactStore implements ArtifactStore {
  async ensureDir(targetPath: string): Promise<void> {
    await fs.mkdir(targetPath, { recursive: true });
  }

  async writeJson(targetPath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async readJson<T>(targetPath: string): Promise<T> {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  }

  async writeBuffer(targetPath: string, data: Buffer): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, data);
  }
}

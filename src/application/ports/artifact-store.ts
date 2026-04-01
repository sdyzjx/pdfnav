export interface ArtifactStore {
  ensureDir(path: string): Promise<void>;
  writeJson(path: string, data: unknown): Promise<void>;
  readJson<T>(path: string): Promise<T>;
  writeBuffer(path: string, data: Buffer): Promise<void>;
}

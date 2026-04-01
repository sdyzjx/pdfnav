import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function getConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "pdf-reader-agent");
  }

  return path.join(os.homedir(), ".config", "pdf-reader-agent");
}

export function getDefaultConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export async function ensureDir(targetPath: string, options?: { filePath?: boolean }): Promise<void> {
  const dir = options?.filePath ? path.dirname(targetPath) : targetPath;
  await fs.mkdir(dir, { recursive: true });
}


import fs from "node:fs/promises";

import type { AppConfig } from "../../../domain/models/config";
import { appConfigSchema } from "../../../domain/schemas/config-schema";
import type { ConfigRepository } from "../../../application/ports/config-repository";
import { ensureDir, getDefaultConfigPath } from "../../../shared/utils/paths";

function createDefaultConfig(): AppConfig {
  return {
    version: "0.1.0",
    providers: {
      bigmodel: {
        apiKey: "",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export class FileConfigRepository implements ConfigRepository {
  private readonly configPath: string;

  constructor(configPath = getDefaultConfigPath()) {
    this.configPath = configPath;
  }

  getPath(): string {
    return this.configPath;
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return appConfigSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code !== "ENOENT") {
        throw error;
      }

      const defaultConfig = createDefaultConfig();
      await this.save(defaultConfig);
      return defaultConfig;
    }
  }

  async save(config: AppConfig): Promise<void> {
    const validated = appConfigSchema.parse(config);
    await ensureDir(this.configPath, { filePath: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  }
}

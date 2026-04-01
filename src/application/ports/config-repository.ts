import type { AppConfig } from "../../domain/models/config";

export interface ConfigRepository {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
  getPath(): string;
}


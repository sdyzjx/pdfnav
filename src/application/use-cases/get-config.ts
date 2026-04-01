import type { AppConfig } from "../../domain/models/config";
import type { ConfigRepository } from "../ports/config-repository";

export async function getConfig(configRepository: ConfigRepository): Promise<AppConfig> {
  return configRepository.load();
}


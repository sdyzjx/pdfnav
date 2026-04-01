import type { AppConfig } from "../../domain/models/config";
import type { ConfigRepository } from "../ports/config-repository";

export interface UpdateConfigInput {
  apiKey?: string;
  baseUrl?: string;
}

export async function updateConfig(
  configRepository: ConfigRepository,
  input: UpdateConfigInput,
): Promise<AppConfig> {
  const current = await configRepository.load();
  const next: AppConfig = {
    ...current,
    providers: {
      ...current.providers,
      bigmodel: {
        ...current.providers.bigmodel,
        apiKey: input.apiKey ?? current.providers.bigmodel.apiKey,
        baseUrl: input.baseUrl ?? current.providers.bigmodel.baseUrl,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  await configRepository.save(next);
  return next;
}


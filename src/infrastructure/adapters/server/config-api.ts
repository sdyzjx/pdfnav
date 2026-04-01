import express from "express";

import type { ConfigRepository } from "../../../application/ports/config-repository";
import type { Logger } from "../../../application/ports/logger";
import { getConfig } from "../../../application/use-cases/get-config";
import { updateConfig } from "../../../application/use-cases/update-config";

export function toConfigPayload(
  config: Awaited<ReturnType<typeof getConfig>>,
  configPath: string,
) {
  return {
    config,
    configPath,
    hasApiKey: Boolean(config.providers.bigmodel.apiKey),
    apiKey: config.providers.bigmodel.apiKey,
    baseUrl: config.providers.bigmodel.baseUrl,
    updatedAt: config.updatedAt,
    source: "Local config",
    configured: Boolean(config.providers.bigmodel.apiKey),
  };
}

export function registerConfigApi(
  app: express.Express,
  configRepository: ConfigRepository,
  logger: Logger,
): void {
  app.get("/api/config", async (_req, res) => {
    const config = await getConfig(configRepository);
    res.json(toConfigPayload(config, configRepository.getPath()));
  });

  app.put("/api/config", async (req, res, next) => {
    try {
      const body = req.body as {
        apiKey?: string;
        bigModelApiKey?: string;
        baseUrl?: string;
      };

      const config = await updateConfig(configRepository, {
        apiKey: body.apiKey ?? body.bigModelApiKey,
        baseUrl: body.baseUrl,
      });

      res.json({
        ok: true,
        ...toConfigPayload(config, configRepository.getPath()),
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error("Web UI request failed", { error: err.message });
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  });
}

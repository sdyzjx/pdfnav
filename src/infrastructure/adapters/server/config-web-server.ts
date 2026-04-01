import express from "express";
import type http from "node:http";

import type { ConfigRepository } from "../../../application/ports/config-repository";
import type { Logger } from "../../../application/ports/logger";
import { registerConfigApi } from "./config-api";
import { resolveWebRoot } from "./web-root";

export interface StartConfigWebServerInput {
  port: number;
  host?: string;
}

export interface StartedConfigWebServer {
  app: express.Express;
  server: http.Server;
}

export async function startConfigWebServer(
  configRepository: ConfigRepository,
  logger: Logger,
  input: StartConfigWebServerInput,
): Promise<StartedConfigWebServer> {
  const app = express();
  const webRoot = resolveWebRoot();

  app.use(express.json());
  app.use(express.static(webRoot));
  registerConfigApi(app, configRepository, logger);

  return await new Promise<StartedConfigWebServer>((resolve, reject) => {
    const server = app.listen(input.port, input.host ?? "127.0.0.1", () => {
      const address = server.address();
      logger.info("Config Web UI started", {
        address,
        configPath: configRepository.getPath(),
      });
      resolve({ app, server });
    });
    server.on("error", reject);
  });
}

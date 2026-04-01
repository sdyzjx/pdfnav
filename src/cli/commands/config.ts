import { Command } from "commander";

import { getConfig } from "../../application/use-cases/get-config";
import { updateConfig } from "../../application/use-cases/update-config";
import { FileConfigRepository } from "../../infrastructure/adapters/config/file-config-repository";
import { PinoLoggerAdapter } from "../../infrastructure/adapters/logger/pino-logger-adapter";
import { startConfigWebServer } from "../../infrastructure/adapters/server/config-web-server";
import { printJson } from "../presenters/json-presenter";

function keepServerAlive(server: import("node:http").Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let closing = false;

    const shutdown = () => {
      if (closing) {
        return;
      }
      closing = true;
      server.close(() => {
        resolve();
      });
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.once("close", resolve);
    server.once("error", reject);
  });
}

export function createConfigCommand(): Command {
  const command = new Command("config").description("Manage runtime configuration");

  command
    .command("get")
    .description("Show current config")
    .action(async () => {
      const repository = new FileConfigRepository();
      const config = await getConfig(repository);

      printJson({
        ok: true,
        configPath: repository.getPath(),
        hasApiKey: Boolean(config.providers.bigmodel.apiKey),
        config,
      });
    });

  command
    .command("set-api-key")
    .description("Set the BigModel API key")
    .argument("<apiKey>", "BigModel API key")
    .action(async (apiKey: string) => {
      const repository = new FileConfigRepository();
      const config = await updateConfig(repository, { apiKey });

      printJson({
        ok: true,
        configPath: repository.getPath(),
        hasApiKey: Boolean(config.providers.bigmodel.apiKey),
      });
    });

  command
    .command("web")
    .description("Start the local Web UI for editing config")
    .option("--port <port>", "Port to listen on", "3210")
    .option("--host <host>", "Host to listen on", "127.0.0.1")
    .action(async (options: { port: string; host: string }) => {
      const repository = new FileConfigRepository();
      const logger = new PinoLoggerAdapter();
      const port = Number(options.port);

      const started = await startConfigWebServer(repository, logger, {
        port,
        host: options.host,
      });

      await keepServerAlive(started.server);
    });

  return command;
}

import pino from "pino";

import type { Logger } from "../../../application/ports/logger";

export class PinoLoggerAdapter implements Logger {
  private readonly logger = pino();

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context ?? {}, message);
  }
}

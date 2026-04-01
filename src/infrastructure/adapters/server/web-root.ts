import fs from "node:fs";
import path from "node:path";

export function resolveWebRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../../webui"),
    path.resolve(__dirname, "../../../../src/webui"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not locate Web UI assets under webui/ or src/webui/.");
}

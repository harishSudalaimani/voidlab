import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (existsSync(full)) dotenv.config({ path: full, quiet: true });
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgres://planner:planner@localhost:5432/planner";
  }
  return process.env;
}

export { root };

import { spawnSync } from "node:child_process";
import pg from "pg";
import { loadEnv, root } from "./env.mjs";

const { Client } = pg;

loadEnv();

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(`
    DROP TABLE IF EXISTS milestones, goals, bucket_items, memberships, workspaces, users, schema_migrations CASCADE
  `);
  console.log("Dropped planner tables.");
} finally {
  await client.end();
}

for (const script of ["migrate.mjs", "seed.mjs"]) {
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

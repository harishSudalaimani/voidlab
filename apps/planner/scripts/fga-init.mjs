import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenFgaClient } from "@openfga/sdk";
import { loadEnv, root } from "./env.mjs";
import { DEMO_MEMBERSHIPS, DEMO_USERS, FEATURE_KEYS } from "./seed-data.mjs";

loadEnv();

const apiUrl = process.env.FGA_API_URL;
if (!apiUrl) {
  console.error("FGA_API_URL is not set. Start OpenFGA first (docker compose up -d openfga).");
  process.exit(1);
}

const model = JSON.parse(readFileSync(path.join(root, "fga", "model.json"), "utf8"));

async function main() {
  let storeId = process.env.FGA_STORE_ID;

  if (!storeId) {
    const bootstrap = new OpenFgaClient({ apiUrl });
    const store = await bootstrap.createStore({ name: `northstar-${Date.now()}` });
    storeId = store.id;
    console.log(`Created OpenFGA store ${storeId}`);
  }

  const client = new OpenFgaClient({ apiUrl, storeId });
  const created = await client.writeAuthorizationModel({
    schemaVersion: model.schema_version,
    typeDefinitions: model.type_definitions,
  });
  const modelId = created.authorization_model_id;
  console.log(`Wrote authorization model ${modelId}`);

  const writes = [];
  for (const workspace of Object.values(
    Object.fromEntries(DEMO_USERS.map((user) => [user.email, user])),
  )) {
    writes.push({
      user: `user:${workspace.email}`,
      relation: "owner",
      object: `workspace:${workspace.workspaceId}`,
    });
  }
  for (const membership of DEMO_MEMBERSHIPS) {
    writes.push({
      user: `user:${membership.email}`,
      relation: membership.role,
      object: `workspace:${membership.workspaceId}`,
    });
  }
  for (const user of DEMO_USERS.filter((demoUser) => demoUser.tier === "pro")) {
    for (const feature of FEATURE_KEYS) {
      writes.push({
        user: `user:${user.email}`,
        relation: "entitled",
        object: `feature:${feature}`,
      });
    }
  }

  const result = await client.write({ writes }, { authorizationModelId: modelId });
  const failed = [...result.writes, ...result.deletes].filter(
    (entry) => entry.status !== "success",
  );
  if (failed.length > 0) {
    console.error("Some tuples failed to write:", failed);
    process.exit(1);
  }
  console.log(`Wrote ${writes.length} relationship tuples.`);

  const envFile = path.join(root, ".env.local");
  let contents = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
    : readFileSync(path.join(root, ".env.example"), "utf8");
  contents = setEnv(contents, "FGA_API_URL", apiUrl);
  contents = setEnv(contents, "FGA_STORE_ID", storeId);
  contents = setEnv(contents, "FGA_MODEL_ID", modelId);
  writeFileSync(envFile, contents);
  console.log(`Updated ${path.relative(root, envFile)} with the store and model IDs.`);
}

function setEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}\n${line}\n`;
}

main().catch((error) => {
  console.error("OpenFGA bootstrap failed:", error?.message ?? error);
  console.error("Check FGA_API_URL and that the deployed OpenFGA instance is reachable.");
  process.exit(1);
});

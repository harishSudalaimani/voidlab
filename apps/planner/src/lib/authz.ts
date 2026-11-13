import "server-only";
import { OpenFgaClient } from "@openfga/sdk";
import { query, queryOne } from "./db";
import { isFgaConfigured } from "./env";
import type { Role, Tier } from "./types";

const MEMBER_ROLES: Exclude<Role, "owner">[] = ["editor", "viewer"];

let cachedClient: OpenFgaClient | null = null;

function getClient(): OpenFgaClient {
  if (!cachedClient) {
    cachedClient = new OpenFgaClient({
      apiUrl: process.env.FGA_API_URL!,
      storeId: process.env.FGA_STORE_ID!,
      authorizationModelId: process.env.FGA_MODEL_ID!,
    });
  }
  return cachedClient;
}

function userObject(email: string): string {
  return `user:${email.trim().toLowerCase()}`;
}

function workspaceObject(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

async function fgaCheck(email: string, relation: string, object: string): Promise<boolean> {
  try {
    const response = await getClient().check({
      user: userObject(email),
      relation,
      object,
    });
    return response.allowed ?? false;
  } catch (error) {
    console.error(`OpenFGA check failed (${relation} ${object}):`, error);
    throw new Error("Authorization service unavailable");
  }
}

export async function getWorkspaceRole(
  email: string,
  workspaceId: string,
): Promise<Role | null> {
  if (!isFgaConfigured()) return getLocalWorkspaceRole(email, workspaceId);

  const [isOwner, isEditor, isViewer] = await Promise.all([
    fgaCheck(email, "owner", workspaceObject(workspaceId)),
    fgaCheck(email, "editor", workspaceObject(workspaceId)),
    fgaCheck(email, "viewer", workspaceObject(workspaceId)),
  ]);
  if (isOwner) return "owner";
  if (isEditor) return "editor";
  if (isViewer) return "viewer";
  return null;
}

export async function listVisibleWorkspaceIds(email: string): Promise<string[]> {
  if (!isFgaConfigured()) {
    const rows = await query<{ id: string }>(
      `SELECT w.id
         FROM workspaces w
         JOIN users u ON lower(u.email) = lower($1)
         LEFT JOIN memberships m
           ON m.workspace_id = w.id AND lower(m.email) = lower($1)
        WHERE w.owner_id = u.id OR m.id IS NOT NULL`,
      [email],
    );
    return rows.map((row) => row.id);
  }

  try {
    const response = await getClient().listObjects({
      user: userObject(email),
      relation: "viewer",
      type: "workspace",
    });
    return response.objects.map((object) => object.replace(/^workspace:/, ""));
  } catch (error) {
    console.error("OpenFGA listObjects failed:", error);
    throw new Error("Authorization service unavailable");
  }
}

export async function hasProEntitlement(email: string, tier: Tier): Promise<boolean> {
  if (!isFgaConfigured()) return tier === "pro";
  return fgaCheck(email, "entitled", "feature:pro");
}

export async function ensureUserGraph(
  email: string,
  workspaceId: string,
  tier: Tier,
): Promise<void> {
  if (!isFgaConfigured()) return;
  const writes = [
    { user: userObject(email), relation: "owner", object: workspaceObject(workspaceId) },
    ...(tier === "pro"
      ? ["pro", "export", "collaboration", "unlimited"].map((feature) => ({
          user: userObject(email),
          relation: "entitled",
          object: `feature:${feature}`,
        }))
      : []),
  ];
  try {
    await getClient().write({ writes });
  } catch (error) {
    console.error("OpenFGA provisioning write failed:", error);
    throw new Error("Authorization service unavailable");
  }
}

export async function setProGraph(email: string, pro: boolean): Promise<void> {
  if (!isFgaConfigured()) return;
  const features = ["pro", "export", "collaboration", "unlimited"];
  const writes = pro
    ? features.map((feature) => ({
        user: userObject(email),
        relation: "entitled",
        object: `feature:${feature}`,
      }))
    : [];
  try {
    const existing = await getClient().read({ user: userObject(email) });
    const deletes = existing.tuples
      .filter((tuple) => tuple.key.relation === "entitled")
      .map((tuple) => ({
        user: tuple.key.user,
        relation: tuple.key.relation,
        object: tuple.key.object,
      }));
    await getClient().write({ writes, deletes });
  } catch (error) {
    console.error("OpenFGA entitlement update failed:", error);
    throw new Error("Authorization service unavailable");
  }
}

export async function setWorkspaceMemberRole(
  email: string,
  workspaceId: string,
  role: Exclude<Role, "owner"> | null,
): Promise<void> {
  if (!isFgaConfigured()) return;
  try {
    const existing = await getClient().read({
      user: userObject(email),
      object: workspaceObject(workspaceId),
    });
    const deletes = existing.tuples
      .filter((tuple) =>
        MEMBER_ROLES.includes(tuple.key.relation as Exclude<Role, "owner">),
      )
      .map((tuple) => ({
        user: tuple.key.user,
        relation: tuple.key.relation,
        object: tuple.key.object,
      }));
    await getClient().write({
      writes: role
        ? [{ user: userObject(email), relation: role, object: workspaceObject(workspaceId) }]
        : [],
      deletes,
    });
  } catch (error) {
    console.error("OpenFGA membership update failed:", error);
    throw new Error("Authorization service unavailable");
  }
}

async function getLocalWorkspaceRole(
  email: string,
  workspaceId: string,
): Promise<Role | null> {
  const row = await queryOne<{ role: Role }>(
    `SELECT CASE WHEN w.owner_id = u.id THEN 'owner' ELSE m.role END AS role
       FROM workspaces w
       JOIN users u ON lower(u.email) = lower($1)
       LEFT JOIN memberships m
         ON m.workspace_id = w.id AND lower(m.email) = lower($1)
      WHERE w.id = $2
        AND (w.owner_id = u.id OR m.id IS NOT NULL)`,
    [email, workspaceId],
  );
  return row?.role ?? null;
}

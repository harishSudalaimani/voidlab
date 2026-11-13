import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getWorkspaceRole, hasProEntitlement, listVisibleWorkspaceIds } from "./authz";
import { query } from "./db";
import { loginPath } from "./session";
import { provisionUser } from "./provision";
import { getSessionUser } from "./session";
import type {
  AppContext,
  AppUser,
  Entitlements,
  Role,
  WorkspaceSummary,
} from "./types";

export const WORKSPACE_COOKIE = "planner_workspace";

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  is_personal: boolean;
}

export async function listWorkspacesFor(user: AppUser): Promise<WorkspaceSummary[]> {
  const visibleIds = new Set(await listVisibleWorkspaceIds(user.email));
  const personal = await query<{ id: string }>(
    `SELECT id FROM workspaces WHERE owner_id = $1 AND is_personal LIMIT 1`,
    [user.id],
  );
  if (personal[0]) visibleIds.add(personal[0].id);
  if (visibleIds.size === 0) return [];

  const rows = await query<WorkspaceRow>(
    `SELECT w.id, w.name, w.owner_id, u.email AS owner_email, w.is_personal
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = ANY($1::uuid[])`,
    [[...visibleIds]],
  );

  const summaries: WorkspaceSummary[] = [];
  for (const row of rows) {
    let role: Role | null = await getWorkspaceRole(user.email, row.id);
    if (!role && row.owner_id === user.id) role = "owner";
    if (!role) continue;
    summaries.push({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      ownerEmail: row.owner_email,
      isPersonal: row.is_personal,
      role,
    });
  }

  return summaries.sort((a, b) => {
    if (a.isPersonal !== b.isPersonal) return a.isPersonal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getEntitlements(user: AppUser): Promise<Entitlements> {
  const pro = await hasProEntitlement(user.email, user.tier);
  return {
    tier: pro ? "pro" : "free",
    pro,
    canCollaborate: pro,
    canExport: pro,
    goalLimit: pro ? null : 3,
    bucketLimit: pro ? null : 10,
  };
}

export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const session = await getSessionUser();
  if (!session) return null;

  const user = await provisionUser(session);
  const workspaces = await listWorkspacesFor(user);
  const store = await cookies();
  const requestedId = store.get(WORKSPACE_COOKIE)?.value;
  const workspace =
    workspaces.find((entry) => entry.id === requestedId) ??
    workspaces.find((entry) => entry.ownerId === user.id) ??
    workspaces[0] ??
    null;
  const entitlements = await getEntitlements(user);

  return { user, workspaces, workspace, entitlements };
});

export async function requireAppContext(): Promise<AppContext> {
  const context = await getAppContext();
  if (!context) redirect(loginPath());
  return context;
}

export async function getWorkspaceForRequest(
  workspaceId: string,
): Promise<WorkspaceSummary | null> {
  const context = await getAppContext();
  return context?.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

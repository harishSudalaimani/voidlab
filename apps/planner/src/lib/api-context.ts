import "server-only";
import { getAppContext } from "./context";
import { ApiError } from "./http";
import type { AppUser, Entitlements, Role, WorkspaceSummary } from "./types";

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export interface ApiContext {
  user: AppUser;
  workspace: WorkspaceSummary;
  role: Role;
  entitlements: Entitlements;
}

export async function requireApiContext(minRole: Role = "viewer"): Promise<ApiContext> {
  const context = await getAppContext();
  if (!context) throw new ApiError("Sign in to continue", 401);
  if (!context.workspace) throw new ApiError("No workspace available", 400);
  if (ROLE_RANK[context.workspace.role] < ROLE_RANK[minRole]) {
    throw new ApiError("You do not have permission to do that", 403, "forbidden");
  }
  return {
    user: context.user,
    workspace: context.workspace,
    role: context.workspace.role,
    entitlements: context.entitlements,
  };
}

export function requirePro(
  entitlements: Entitlements,
  message: string,
): void {
  if (!entitlements.pro) {
    throw new ApiError(message, 402, "upgrade_required");
  }
}

import { NextRequest } from "next/server";
import { requireApiContext, requirePro } from "@/lib/api-context";
import { setWorkspaceMemberRole } from "@/lib/authz";
import { query, queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, parseId, readJson } from "@/lib/http";
import { memberUpdateSchema } from "@/lib/validation";

interface MembershipRow {
  id: string;
  workspace_id: string;
  email: string;
  role: "editor" | "viewer";
  invited_by: string | null;
  created_at: Date;
}

async function findMembership(id: string, workspaceId: string) {
  return queryOne<MembershipRow>(
    `SELECT id, workspace_id, email, role, invited_by, created_at
       FROM memberships
      WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireApiContext("owner");
    requirePro(context.entitlements, "Collaboration is a Pro feature.");
    const id = parseId((await params).id);
    const membership = await findMembership(id, context.workspace.id);
    if (!membership) throw new ApiError("Member not found", 404);

    const { role } = memberUpdateSchema.parse(await readJson(request));
    if (role === membership.role) return json({ member: membership });

    await query(`UPDATE memberships SET role = $1 WHERE id = $2`, [role, id]);
    try {
      await setWorkspaceMemberRole(membership.email, context.workspace.id, role);
    } catch (error) {
      await query(`UPDATE memberships SET role = $1 WHERE id = $2`, [membership.role, id]);
      console.error(error);
      throw new ApiError("Authorization service unavailable", 503);
    }

    return json({ member: { ...membership, role } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireApiContext("owner");
    const id = parseId((await params).id);
    const membership = await findMembership(id, context.workspace.id);
    if (!membership) throw new ApiError("Member not found", 404);

    await query(`DELETE FROM memberships WHERE id = $1`, [id]);
    try {
      await setWorkspaceMemberRole(membership.email, context.workspace.id, null);
    } catch (error) {
      await query(
        `INSERT INTO memberships (id, workspace_id, email, role, invited_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          membership.id,
          membership.workspace_id,
          membership.email,
          membership.role,
          membership.invited_by,
          membership.created_at,
        ],
      );
      console.error(error);
      throw new ApiError("Authorization service unavailable", 503);
    }

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

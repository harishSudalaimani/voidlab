import { NextRequest } from "next/server";
import { requireApiContext, requirePro } from "@/lib/api-context";
import { setWorkspaceMemberRole } from "@/lib/authz";
import { query, queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { inviteSchema } from "@/lib/validation";

interface MembershipRow {
  id: string;
  email: string;
  role: "editor" | "viewer";
}

export async function GET() {
  try {
    const context = await requireApiContext("viewer");
    const rows = await query(
      `SELECT m.id, m.email, m.role, m.created_at
         FROM memberships m
        WHERE m.workspace_id = $1
        ORDER BY m.created_at`,
      [context.workspace.id],
    );
    return json({ members: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireApiContext("owner");
    requirePro(
      context.entitlements,
      "Collaboration is a Pro feature. Upgrade to invite editors and viewers.",
    );

    const input = inviteSchema.parse(await readJson(request));
    if (input.email === context.user.email.toLowerCase()) {
      throw new ApiError("You are already the owner of this workspace", 400);
    }
    if (input.email === context.workspace.ownerEmail.toLowerCase()) {
      throw new ApiError("That person already owns this workspace", 409);
    }

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM memberships WHERE workspace_id = $1 AND lower(email) = lower($2)`,
      [context.workspace.id, input.email],
    );
    if (existing) throw new ApiError("That person already has access", 409);

    const membership = await queryOne<MembershipRow>(
      `INSERT INTO memberships (id, workspace_id, email, role, invited_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id, email, role`,
      [context.workspace.id, input.email, input.role, context.user.id],
    );

    try {
      await setWorkspaceMemberRole(input.email, context.workspace.id, input.role);
    } catch (error) {
      await query(`DELETE FROM memberships WHERE id = $1`, [membership?.id]);
      console.error(error);
      throw new ApiError("Authorization service unavailable", 503);
    }

    return json({ member: membership }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

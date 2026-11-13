import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { query, queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, parseId, readJson } from "@/lib/http";
import { goalUpdateSchema } from "@/lib/validation";
import type { GoalCategory, GoalStatus } from "@/lib/types";

interface GoalRow {
  id: string;
  title: string;
  description: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: number;
  quarter: number;
}

async function findGoal(id: string, workspaceId: string) {
  return queryOne<GoalRow>(
    `SELECT id, title, description, category, status, progress, quarter
       FROM goals
      WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId],
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireApiContext("editor");
    const id = parseId((await params).id);
    const current = await findGoal(id, context.workspace.id);
    if (!current) throw new ApiError("Goal not found", 404);

    const input = goalUpdateSchema.parse(await readJson(request));
    await query(
      `UPDATE goals
          SET title = $1, description = $2, category = $3, status = $4,
              progress = $5, quarter = $6, updated_at = now()
        WHERE id = $7`,
      [
        input.title ?? current.title,
        input.description ?? current.description,
        input.category ?? current.category,
        input.status ?? current.status,
        input.progress ?? current.progress,
        input.quarter ?? current.quarter,
        id,
      ],
    );

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireApiContext("editor");
    const id = parseId((await params).id);
    const deleted = await queryOne<{ id: string }>(
      `DELETE FROM goals WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, context.workspace.id],
    );
    if (!deleted) throw new ApiError("Goal not found", 404);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

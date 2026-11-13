import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { query, queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, parseId, readJson } from "@/lib/http";
import { syncGoalProgress } from "@/lib/planner";
import { milestoneUpdateSchema } from "@/lib/validation";

interface MilestoneRow {
  id: string;
  goal_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  sort_order: number;
}

async function findMilestone(id: string, workspaceId: string) {
  return queryOne<MilestoneRow>(
    `SELECT m.id, m.goal_id, m.title, m.done,
            to_char(m.due_date, 'YYYY-MM-DD') AS due_date, m.sort_order
       FROM milestones m
       JOIN goals g ON g.id = m.goal_id
      WHERE m.id = $1 AND g.workspace_id = $2`,
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
    const current = await findMilestone(id, context.workspace.id);
    if (!current) throw new ApiError("Milestone not found", 404);

    const input = milestoneUpdateSchema.parse(await readJson(request));
    const updated = await queryOne<MilestoneRow>(
      `UPDATE milestones
          SET title = $1, done = $2, due_date = $3
        WHERE id = $4
        RETURNING id, goal_id, title, done,
                  to_char(due_date, 'YYYY-MM-DD') AS due_date, sort_order`,
      [
        input.title ?? current.title,
        input.done ?? current.done,
        input.dueDate === undefined ? current.due_date : input.dueDate,
        id,
      ],
    );

    await syncGoalProgress(current.goal_id);
    return json({ milestone: updated });
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
    const current = await findMilestone(id, context.workspace.id);
    if (!current) throw new ApiError("Milestone not found", 404);

    await query(`DELETE FROM milestones WHERE id = $1`, [id]);
    await syncGoalProgress(current.goal_id);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

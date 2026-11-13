import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, parseId, readJson } from "@/lib/http";
import { syncGoalProgress } from "@/lib/planner";
import { milestoneCreateSchema } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireApiContext("editor");
    const goalId = parseId((await params).id);
    const goal = await queryOne<{ id: string }>(
      `SELECT id FROM goals WHERE id = $1 AND workspace_id = $2`,
      [goalId, context.workspace.id],
    );
    if (!goal) throw new ApiError("Goal not found", 404);

    const input = milestoneCreateSchema.parse(await readJson(request));
    const milestone = await queryOne<{
      id: string;
      title: string;
      done: boolean;
      due_date: string | null;
      sort_order: number;
    }>(
      `INSERT INTO milestones (id, goal_id, title, due_date, sort_order)
       VALUES ($1, $2, $3, $4,
               (SELECT coalesce(max(sort_order) + 1, 0) FROM milestones WHERE goal_id = $2))
       RETURNING id, title, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, sort_order`,
      [randomUUID(), goalId, input.title, input.dueDate ?? null],
    );

    await syncGoalProgress(goalId);
    return json({ milestone }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

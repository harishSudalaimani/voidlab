import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { listGoals } from "@/lib/planner";
import { goalCreateSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const context = await requireApiContext("viewer");
    const yearParam = request.nextUrl.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ApiError("Invalid year", 400);
    }
    const goals = await listGoals(context.workspace.id, year);
    return json({ goals });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireApiContext("editor");
    const input = goalCreateSchema.parse(await readJson(request));

    if (!context.entitlements.pro) {
      const count = await queryOne<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM goals
          WHERE workspace_id = $1 AND year = $2`,
        [context.workspace.id, input.year],
      );
      if ((count?.count ?? 0) >= (context.entitlements.goalLimit ?? 3)) {
        throw new ApiError(
          "The Free plan includes 3 goals per year. Upgrade to Pro for unlimited goals.",
          402,
          "upgrade_required",
        );
      }
    }

    const goal = await queryOne<{ id: string }>(
      `INSERT INTO goals
         (id, workspace_id, year, quarter, title, description, category, status, progress, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        randomUUID(),
        context.workspace.id,
        input.year,
        input.quarter,
        input.title,
        input.description ?? "",
        input.category,
        input.status,
        input.progress,
        context.user.id,
      ],
    );

    return json({ goal: { id: goal?.id } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

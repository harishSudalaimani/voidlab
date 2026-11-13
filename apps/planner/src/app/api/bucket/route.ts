import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { listBucketItems } from "@/lib/planner";
import { bucketCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const context = await requireApiContext("viewer");
    const items = await listBucketItems(context.workspace.id);
    return json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireApiContext("editor");
    const input = bucketCreateSchema.parse(await readJson(request));

    if (!context.entitlements.pro) {
      const count = await queryOne<{ count: number }>(
        `SELECT count(*)::int AS count FROM bucket_items WHERE workspace_id = $1`,
        [context.workspace.id],
      );
      if ((count?.count ?? 0) >= (context.entitlements.bucketLimit ?? 10)) {
        throw new ApiError(
          "The Free plan includes 10 bucket list items. Upgrade to Pro for an unlimited list.",
          402,
          "upgrade_required",
        );
      }
    }

    const item = await queryOne<{ id: string }>(
      `INSERT INTO bucket_items
         (id, workspace_id, title, description, category, status, priority,
          target_year, target_date, estimated_cost, link, completed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $6 = 'done' THEN now() ELSE NULL END, $12)
       RETURNING id`,
      [
        randomUUID(),
        context.workspace.id,
        input.title,
        input.description ?? "",
        input.category,
        input.status,
        input.priority,
        input.targetYear ?? null,
        input.targetDate ?? null,
        input.estimatedCost ?? null,
        input.link?.trim() || null,
        context.user.id,
      ],
    );

    return json({ item: { id: item?.id } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

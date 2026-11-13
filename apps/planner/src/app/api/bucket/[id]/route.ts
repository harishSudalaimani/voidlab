import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { query, queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, parseId, readJson } from "@/lib/http";
import { bucketUpdateSchema } from "@/lib/validation";
import type { BucketCategory, BucketPriority, BucketStatus } from "@/lib/types";

interface BucketRow {
  id: string;
  title: string;
  description: string;
  category: BucketCategory;
  status: BucketStatus;
  priority: BucketPriority;
  target_year: number | null;
  target_date: string | null;
  estimated_cost: string | null;
  link: string | null;
}

async function findItem(id: string, workspaceId: string) {
  return queryOne<BucketRow>(
    `SELECT id, title, description, category, status, priority, target_year,
            to_char(target_date, 'YYYY-MM-DD') AS target_date, estimated_cost, link
       FROM bucket_items
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
    const current = await findItem(id, context.workspace.id);
    if (!current) throw new ApiError("Bucket list item not found", 404);

    const input = bucketUpdateSchema.parse(await readJson(request));
    await query(
      `UPDATE bucket_items
          SET title = $1, description = $2, category = $3, status = $4, priority = $5,
              target_year = $6, target_date = $7, estimated_cost = $8, link = $9,
              completed_at = CASE
                               WHEN $4 = 'done' THEN coalesce(completed_at, now())
                               ELSE NULL
                             END,
              updated_at = now()
        WHERE id = $10 AND workspace_id = $11`,
      [
        input.title ?? current.title,
        input.description ?? current.description,
        input.category ?? current.category,
        input.status ?? current.status,
        input.priority ?? current.priority,
        input.targetYear === undefined ? current.target_year : input.targetYear,
        input.targetDate === undefined ? current.target_date : input.targetDate,
        input.estimatedCost === undefined
          ? current.estimated_cost
          : input.estimatedCost,
        input.link === undefined ? current.link : input.link?.trim() || null,
        id,
        context.workspace.id,
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
      `DELETE FROM bucket_items WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, context.workspace.id],
    );
    if (!deleted) throw new ApiError("Bucket list item not found", 404);
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

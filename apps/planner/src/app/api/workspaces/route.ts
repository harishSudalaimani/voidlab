import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api-context";
import { queryOne } from "@/lib/db";
import { handleApiError, json, readJson } from "@/lib/http";
import { workspaceRenameSchema } from "@/lib/validation";

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireApiContext("owner");
    const { name } = workspaceRenameSchema.parse(await readJson(request));
    const row = await queryOne<{ id: string; name: string }>(
      `UPDATE workspaces SET name = $1 WHERE id = $2 RETURNING id, name`,
      [name, context.workspace.id],
    );
    return json({ workspace: row });
  } catch (error) {
    return handleApiError(error);
  }
}

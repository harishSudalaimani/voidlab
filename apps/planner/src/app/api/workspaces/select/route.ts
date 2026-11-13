import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api-context";
import { getAppContext, WORKSPACE_COOKIE } from "@/lib/context";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    await requireApiContext("viewer");
    const { workspaceId } = schema.parse(await readJson(request));
    const context = await getAppContext();
    const workspace = context?.workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) throw new ApiError("Workspace not found", 404);

    const store = await cookies();
    store.set(WORKSPACE_COOKIE, workspace.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return json({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}

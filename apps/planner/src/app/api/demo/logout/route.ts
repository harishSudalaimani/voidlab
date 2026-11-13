import { isAuth0Mode } from "@/lib/env";
import { ApiError, handleApiError, json } from "@/lib/http";
import { clearDemoSession } from "@/lib/session";

export async function POST() {
  try {
    if (isAuth0Mode()) throw new ApiError("Demo sign-in is disabled", 404);
    await clearDemoSession();
    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

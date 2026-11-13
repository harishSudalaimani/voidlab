import { query } from "@/lib/db";
import { isAuth0Mode } from "@/lib/env";
import { ApiError, handleApiError, json } from "@/lib/http";

export async function GET() {
  try {
    if (isAuth0Mode()) throw new ApiError("Demo accounts are disabled", 404);
    const rows = await query<{ email: string; name: string; tier: string }>(
      `SELECT email, name, tier
         FROM users
        WHERE id LIKE 'demo|%'
        ORDER BY name`,
    );
    return json({ accounts: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

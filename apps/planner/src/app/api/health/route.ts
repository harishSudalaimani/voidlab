import { query } from "@/lib/db";
import { isAuth0Mode, isFgaConfigured } from "@/lib/env";
import { handleApiError, json } from "@/lib/http";

export async function GET() {
  try {
    await query("SELECT 1");
    return json({
      status: "ok",
      database: "ok",
      authMode: isAuth0Mode() ? "auth0" : "demo",
      authorization: isFgaConfigured() ? "openfga" : "postgres-fallback",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

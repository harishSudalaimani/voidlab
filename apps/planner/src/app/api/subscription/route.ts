import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api-context";
import { setProGraph } from "@/lib/authz";
import { query } from "@/lib/db";
import { isAuth0Mode } from "@/lib/env";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";

const schema = z.object({ tier: z.enum(["free", "pro"]) });

export async function POST(request: NextRequest) {
  try {
    const context = await requireApiContext("viewer");
    if (isAuth0Mode()) {
      throw new ApiError(
        "Subscription changes are managed by the billing provider in Auth0 mode.",
        403,
        "billing_managed_externally",
      );
    }

    const { tier } = schema.parse(await readJson(request));
    await query(
      `UPDATE users SET tier = $1, fga_synced_at = now(), updated_at = now() WHERE id = $2`,
      [tier, context.user.id],
    );
    await setProGraph(context.user.email, tier === "pro");

    return json({
      tier,
      entitlements: {
        tier,
        pro: tier === "pro",
        canCollaborate: tier === "pro",
        canExport: tier === "pro",
        goalLimit: tier === "pro" ? null : 3,
        bucketLimit: tier === "pro" ? null : 10,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

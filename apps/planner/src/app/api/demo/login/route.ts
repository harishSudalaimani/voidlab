import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { isAuth0Mode } from "@/lib/env";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { provisionUser } from "@/lib/provision";
import { createDemoSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100).optional(),
});

interface ExistingUserRow {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function POST(request: NextRequest) {
  try {
    if (isAuth0Mode()) throw new ApiError("Demo sign-in is disabled", 404);

    const { email, name } = schema.parse(await readJson(request));
    const existing = await queryOne<ExistingUserRow>(
      `SELECT id, email, name, picture FROM users WHERE lower(email) = $1`,
      [email],
    );
    const sessionUser = {
      sub: existing?.id ?? `demo|${email}`,
      email,
      name: name ?? existing?.name ?? email.split("@")[0],
      picture: existing?.picture ?? null,
    };
    const user = await provisionUser(sessionUser);
    await createDemoSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

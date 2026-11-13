import { NextRequest } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { isAuth0Mode } from "@/lib/env";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { provisionUser } from "@/lib/provision";
import { createDemoSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

interface DemoUserRow {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function POST(request: NextRequest) {
  try {
    if (isAuth0Mode()) throw new ApiError("Demo sign-in is disabled", 404);

    const { email } = schema.parse(await readJson(request));
    const user = await queryOne<DemoUserRow>(
      `SELECT id, email, name, picture
         FROM users
        WHERE lower(email) = $1 AND id LIKE 'demo|%'`,
      [email],
    );
    if (!user) throw new ApiError("That demo account does not exist", 404);

    await provisionUser({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
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

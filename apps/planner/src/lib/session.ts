import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuth0 } from "./auth0";
import { isAuth0Mode } from "./env";
import type { SessionUser } from "./types";

const COOKIE_NAME = "planner_demo_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const secret = process.env.DEMO_SESSION_SECRET || process.env.AUTH_SECRET;
  if (secret) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEMO_SESSION_SECRET must be set to use demo mode in production");
  }
  return new TextEncoder().encode("voidlab-planner-development-demo-secret");
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (isAuth0Mode()) {
    try {
      const session = await getAuth0().getSession();
      if (!session?.user?.email) return null;
      return {
        sub: session.user.sub,
        email: session.user.email,
        name: session.user.name ?? session.user.email.split("@")[0],
        picture: session.user.picture ?? null,
      };
    } catch (error) {
      console.error("Could not read Auth0 session:", error);
      return null;
    }
  }

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export async function createDemoSession(user: SessionUser): Promise<void> {
  if (isAuth0Mode()) throw new Error("Demo sessions are disabled in Auth0 mode");
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearDemoSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function loginPath(): string {
  return isAuth0Mode() ? "/auth/login" : "/login";
}

export function logoutPath(): string {
  return isAuth0Mode() ? "/auth/logout" : "/login?logout=1";
}

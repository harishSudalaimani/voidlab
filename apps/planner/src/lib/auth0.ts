import "server-only";
import { Auth0Client } from "@auth0/nextjs-auth0/server";

let client: Auth0Client | null = null;

export function getAuth0(): Auth0Client {
  if (!client) {
    client = new Auth0Client({
      signInReturnToPath: "/dashboard",
    });
  }
  return client;
}

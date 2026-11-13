export function isAuth0Mode(): boolean {
  return (process.env.AUTH_MODE ?? "demo").toLowerCase() === "auth0";
}

export function isDemoMode(): boolean {
  return !isAuth0Mode();
}

export function isFgaConfigured(): boolean {
  return Boolean(
    process.env.FGA_API_URL && process.env.FGA_STORE_ID && process.env.FGA_MODEL_ID,
  );
}

export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ?? "postgres://planner:planner@localhost:5432/planner"
  );
}

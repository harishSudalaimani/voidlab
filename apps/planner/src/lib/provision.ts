import "server-only";
import { ensureUserGraph } from "./authz";
import { query, queryOne } from "./db";
import { isFgaConfigured } from "./env";
import type { AppUser, SessionUser, Tier } from "./types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  tier: Tier;
  fga_synced_at: Date | null;
}

function toAppUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    tier: row.tier,
  };
}

function workspaceNameFor(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `${first}'s Northstar` : "My Northstar";
}

async function ensurePersonalWorkspace(user: UserRow): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM workspaces WHERE owner_id = $1 AND is_personal LIMIT 1`,
    [user.id],
  );
  if (existing) return existing.id;

  const created = await queryOne<{ id: string }>(
    `INSERT INTO workspaces (id, name, owner_id, is_personal)
     VALUES (gen_random_uuid(), $1, $2, true)
     ON CONFLICT (owner_id) WHERE is_personal DO NOTHING
     RETURNING id`,
    [workspaceNameFor(user.name), user.id],
  );
  if (created) return created.id;

  const raced = await queryOne<{ id: string }>(
    `SELECT id FROM workspaces WHERE owner_id = $1 AND is_personal LIMIT 1`,
    [user.id],
  );
  if (!raced) throw new Error("Could not provision a personal workspace");
  return raced.id;
}

export async function provisionUser(session: SessionUser): Promise<AppUser> {
  const email = session.email.trim().toLowerCase();
  const name = session.name?.trim() || email.split("@")[0];

  const row = await queryOne<UserRow>(
    `INSERT INTO users (id, email, name, picture)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           picture = EXCLUDED.picture,
           updated_at = now()
     RETURNING *`,
    [session.sub, email, name, session.picture],
  );
  if (!row) throw new Error("Could not provision the user");

  const workspaceId = await ensurePersonalWorkspace(row);

  if (isFgaConfigured() && !row.fga_synced_at) {
    await ensureUserGraph(row.email, workspaceId, row.tier);
    await query(`UPDATE users SET fga_synced_at = now() WHERE id = $1`, [row.id]);
  }

  return toAppUser(row);
}

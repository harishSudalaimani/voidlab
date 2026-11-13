import pg from "pg";
import { loadEnv } from "./env.mjs";
import {
  DEMO_BUCKET_ITEMS,
  DEMO_GOALS,
  DEMO_MEMBERSHIPS,
  DEMO_USERS,
} from "./seed-data.mjs";

const { Client } = pg;

loadEnv();

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query("BEGIN");

  for (const user of DEMO_USERS) {
    await client.query(
      `INSERT INTO users (id, email, name, tier)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, user.email, user.name, user.tier],
    );
    await client.query(
      `INSERT INTO workspaces (id, name, owner_id, is_personal)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO NOTHING`,
      [user.workspaceId, user.workspaceName, user.id],
    );
  }

  for (const member of DEMO_MEMBERSHIPS) {
    const owner = DEMO_USERS.find((user) => user.workspaceId === member.workspaceId);
    await client.query(
      `INSERT INTO memberships (id, workspace_id, email, role, invited_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (workspace_id, email) DO NOTHING`,
      [member.workspaceId, member.email, member.role, owner?.id ?? null],
    );
  }

  for (const goal of DEMO_GOALS) {
    const owner = DEMO_USERS.find((user) => user.workspaceId === goal.workspaceId);
    await client.query(
      `INSERT INTO goals
         (id, workspace_id, year, quarter, title, description, category, status, progress, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        goal.id,
        goal.workspaceId,
        goal.year,
        goal.quarter,
        goal.title,
        goal.description,
        goal.category,
        goal.status,
        goal.progress,
        owner?.id ?? null,
      ],
    );

    for (const [index, milestone] of goal.milestones.entries()) {
      await client.query(
        `INSERT INTO milestones (id, goal_id, title, done, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [milestone.id, goal.id, milestone.title, milestone.done, index],
      );
    }
  }

  for (const item of DEMO_BUCKET_ITEMS) {
    const owner = DEMO_USERS.find((user) => user.workspaceId === item.workspaceId);
    await client.query(
      `INSERT INTO bucket_items
         (id, workspace_id, title, description, category, status, priority,
          target_year, target_date, estimated_cost, link, completed_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $6 = 'done' THEN now() ELSE NULL END, $12)
       ON CONFLICT (id) DO NOTHING`,
      [
        item.id,
        item.workspaceId,
        item.title,
        item.description,
        item.category,
        item.status,
        item.priority,
        item.targetYear,
        item.targetDate,
        item.estimatedCost,
        item.link,
        owner?.id ?? null,
      ],
    );
  }

  await client.query("COMMIT");
  console.log(`Seeded ${DEMO_USERS.length} demo users, ${DEMO_GOALS.length} goals and ${DEMO_BUCKET_ITEMS.length} bucket items.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

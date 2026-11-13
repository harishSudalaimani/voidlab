import "server-only";
import { query, queryOne } from "./db";
import {
  computeStats as statsCompute,
  nextMilestones as statsMilestones,
  upcomingBucketItems as statsUpcoming,
} from "./stats";
import type {
  BucketCategory,
  BucketItem,
  BucketPriority,
  BucketStatus,
  Goal,
  GoalCategory,
  GoalStatus,
  Milestone,
  PlannerStats,
  WorkspaceMember,
} from "./types";

interface GoalRow {
  id: string;
  workspace_id: string;
  year: number;
  quarter: number;
  title: string;
  description: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: number;
  created_at: Date;
  updated_at: Date;
  milestone_id: string | null;
  milestone_title: string | null;
  milestone_done: boolean | null;
  milestone_due_date: string | null;
  milestone_sort_order: number | null;
}

interface BucketRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  category: BucketCategory;
  status: BucketStatus;
  priority: BucketPriority;
  target_year: number | null;
  target_date: string | null;
  estimated_cost: string | null;
  link: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function listGoals(workspaceId: string, year: number): Promise<Goal[]> {
  const rows = await query<GoalRow>(
    `SELECT g.id, g.workspace_id, g.year, g.quarter, g.title, g.description,
            g.category, g.status, g.progress, g.created_at, g.updated_at,
            m.id AS milestone_id, m.title AS milestone_title, m.done AS milestone_done,
            to_char(m.due_date, 'YYYY-MM-DD') AS milestone_due_date,
            m.sort_order AS milestone_sort_order
       FROM goals g
       LEFT JOIN milestones m ON m.goal_id = g.id
      WHERE g.workspace_id = $1 AND g.year = $2
      ORDER BY g.quarter, g.created_at, m.sort_order, m.created_at`,
    [workspaceId, year],
  );

  const goals = new Map<string, Goal>();
  for (const row of rows) {
    let goal = goals.get(row.id);
    if (!goal) {
      goal = {
        id: row.id,
        workspaceId: row.workspace_id,
        year: row.year,
        quarter: row.quarter,
        title: row.title,
        description: row.description,
        category: row.category,
        status: row.status,
        progress: row.progress,
        milestones: [],
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
      goals.set(row.id, goal);
    }
    if (row.milestone_id) {
      const milestone: Milestone = {
        id: row.milestone_id,
        title: row.milestone_title ?? "",
        done: row.milestone_done ?? false,
        dueDate: row.milestone_due_date,
        sortOrder: row.milestone_sort_order ?? 0,
      };
      goal.milestones.push(milestone);
    }
  }
  return [...goals.values()];
}

export async function listBucketItems(workspaceId: string): Promise<BucketItem[]> {
  const rows = await query<BucketRow>(
    `SELECT id, workspace_id, title, description, category, status, priority,
            target_year, to_char(target_date, 'YYYY-MM-DD') AS target_date,
            estimated_cost, link, completed_at, created_at, updated_at
       FROM bucket_items
      WHERE workspace_id = $1
      ORDER BY (status = 'done'), 
               CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               created_at DESC`,
    [workspaceId],
  );

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    targetYear: row.target_year,
    targetDate: row.target_date,
    estimatedCost: row.estimated_cost === null ? null : Number(row.estimated_cost),
    link: row.link,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const owner = await queryOne<{
    id: string;
    email: string;
    name: string;
    created_at: Date;
  }>(
    `SELECT w.owner_id AS id, u.email, u.name, w.created_at
       FROM workspaces w
       JOIN users u ON u.id = w.owner_id
      WHERE w.id = $1`,
    [workspaceId],
  );

  const rows = await query<{
    id: string;
    email: string;
    name: string | null;
    role: "editor" | "viewer";
    user_id: string | null;
    created_at: Date;
  }>(
    `SELECT m.id, m.email, u.name, m.role, u.id AS user_id, m.created_at
       FROM memberships m
       LEFT JOIN users u ON lower(u.email) = lower(m.email)
      WHERE m.workspace_id = $1
      ORDER BY m.created_at`,
    [workspaceId],
  );

  const members: WorkspaceMember[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    userId: row.user_id,
    createdAt: row.created_at.toISOString(),
  }));

  if (owner) {
    members.unshift({
      id: `owner:${workspaceId}`,
      email: owner.email,
      name: owner.name,
      role: "owner",
      userId: owner.id,
      createdAt: owner.created_at.toISOString(),
    });
  }
  return members;
}

export function computeStats(goals: Goal[], bucketItems: BucketItem[]): PlannerStats {
  return statsCompute(goals, bucketItems);
}

export function nextMilestones(goals: Goal[], limit = 5): Array<Milestone & { goalTitle: string }> {
  return statsMilestones(goals, limit);
}

export function upcomingBucketItems(items: BucketItem[], limit = 4): BucketItem[] {
  return statsUpcoming(items, limit);
}

export async function syncGoalProgress(goalId: string): Promise<void> {
  await query(
    `UPDATE goals g
        SET progress = CASE WHEN stats.total = 0 THEN g.progress ELSE stats.progress END,
            status = CASE
                       WHEN stats.total = 0 THEN g.status
                       WHEN stats.done = stats.total THEN 'done'
                       WHEN stats.done > 0 THEN 'in_progress'
                       ELSE 'planned'
                     END,
            updated_at = now()
       FROM (
         SELECT count(*)::int AS total, count(*) FILTER (WHERE done)::int AS done,
                CASE WHEN count(*) = 0 THEN 0
                     ELSE round(count(*) FILTER (WHERE done) * 100.0 / count(*))::int
                END AS progress
           FROM milestones
          WHERE goal_id = $1
       ) stats
      WHERE g.id = $1`,
    [goalId],
  );
}

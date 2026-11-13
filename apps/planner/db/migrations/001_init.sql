-- Northstar planner schema.
-- Authorization data (roles, entitlements) lives in OpenFGA; the tables below
-- are the application's source of truth and the local-mode policy mirror.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  picture       TEXT,
  tier          TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  fga_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_personal_workspace_per_owner
  ON workspaces (owner_id)
  WHERE is_personal;

CREATE TABLE IF NOT EXISTS memberships (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS memberships_email ON memberships (lower(email));

CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  year         INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  quarter      INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'personal',
  status       TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'in_progress', 'done')),
  progress     INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goals_workspace_year ON goals (workspace_id, year);

CREATE TABLE IF NOT EXISTS milestones (
  id         UUID PRIMARY KEY,
  goal_id    UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  due_date   DATE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS milestones_goal ON milestones (goal_id, sort_order);

CREATE TABLE IF NOT EXISTS bucket_items (
  id             UUID PRIMARY KEY,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'travel',
  status         TEXT NOT NULL DEFAULT 'idea'
                   CHECK (status IN ('idea', 'planned', 'in_progress', 'done')),
  priority       TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low', 'medium', 'high')),
  target_year    INT CHECK (target_year BETWEEN 2000 AND 2100),
  target_date    DATE,
  estimated_cost NUMERIC(12, 2),
  link           TEXT,
  completed_at   TIMESTAMPTZ,
  created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bucket_workspace ON bucket_items (workspace_id);
CREATE INDEX IF NOT EXISTS bucket_status ON bucket_items (workspace_id, status);

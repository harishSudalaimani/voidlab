CREATE TABLE IF NOT EXISTS portfolio_profiles (
  owner_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE,
  profile     JSONB NOT NULL,
  theme       TEXT NOT NULL DEFAULT 'editorial'
                CHECK (theme IN ('editorial', 'midnight', 'cobalt', 'atelier', 'paper')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_profiles_slug ON portfolio_profiles (slug);

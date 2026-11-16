# Planit planner

## Run locally

From this directory, install dependencies and start Next.js:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage opens Planit directly, with no sign-in or sign-up required. Planner tasks and multi-page whiteboard or blackboard books save per date; any date can be selected. Create multiple study notes and bucket list ideas, each with its own drawing book. Your notes and boards are saved locally in this browser. The app includes dark and white themes and can be installed from a supported browser. On iPad or iPhone, open Planit in Safari, tap Share, then choose “Add to Home Screen.”

To use the database-backed sections, start Postgres and initialize the schema:

```bash
docker compose up -d postgres
cp -n .env.example .env.local
npm run setup
```

For the local database setup, `.env.local` needs `AUTH_MODE=demo` and `DATABASE_URL=postgres://planner:planner@localhost:5432/planner`.

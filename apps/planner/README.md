# Planit planner

## Run locally

From this directory, install dependencies and start Next.js:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage opens Planit directly, with no sign-in or sign-up required. Planner tasks and separate whiteboard or blackboard pages save per date; any date can be selected. Study notes and bucket list ideas are saved in this browser. The app includes dark and white themes.

To use the database-backed sections, start Postgres and initialize the schema:

```bash
docker compose up -d postgres
cp -n .env.example .env.local
npm run setup
```

For the local database setup, `.env.local` needs `AUTH_MODE=demo` and `DATABASE_URL=postgres://planner:planner@localhost:5432/planner`.

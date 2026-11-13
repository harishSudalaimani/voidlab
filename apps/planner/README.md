# Northstar planner

## Run locally

From this directory, start the local database, copy the development environment, install dependencies, create the schema and demo accounts, then start Next.js:

```bash
docker compose up -d postgres
cp -n .env.example .env.local
npm install
npm run setup
npm run dev
```

If `.env.local` already exists, keep it and make sure `DATABASE_URL` points to `postgres://planner:planner@localhost:5432/planner` for this local setup.

Open [http://localhost:3000](http://localhost:3000). Sign in with one of the demo accounts shown on the login page. The daily plan and journal currently save in this browser; yearly goals and bucket list items use Postgres.

To stop the database while keeping its data, run `docker compose stop postgres`. To remove the database container and its saved data, run `docker compose down -v`.

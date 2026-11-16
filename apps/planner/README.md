# Kiroku planner

## Run locally

From this directory, install dependencies and start Next.js:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage opens Kiroku directly, with no sign-in or sign-up required. Planner tasks and multi-page whiteboard or blackboard books save per date; any date can be selected. Create multiple study notes and bucket list ideas, each with its own drawing book. Finance tracks transactions, budgets, subscriptions, savings goals, investments, and spending analytics. Planner and finance data are saved in this browser on this device. The app includes dark and white themes and can be installed from a supported browser. On Android Chrome, use **Install app** or the browser menu’s **Add to Home screen**. On iPad or iPhone Safari, tap Share, then **Add to Home Screen**. On desktop Chrome or Edge, use the install icon or browser menu.

Open **Portfolio editor** in Kiroku to edit your independent public page, add work and education details, set GitHub and LinkedIn, and choose one of five complete designs. Use **View public page** in the editor to preview it. With a signed-in Kiroku account and the database migrations applied, changes publish automatically and the editor provides a shareable `/portfolio/your-name` address; visitors can view it without editing controls. The no-login local preview saves in this browser only. Put your résumé under `public/` and enter its path (for example, `/resume.pdf`) in the editor to enable the download link.

To use the database-backed sections, start Postgres and initialize the schema:

```bash
docker compose up -d postgres
cp -n .env.example .env.local
npm run setup
```

For the local database setup, `.env.local` needs `AUTH_MODE=demo` and `DATABASE_URL=postgres://planner:planner@localhost:5432/planner`.

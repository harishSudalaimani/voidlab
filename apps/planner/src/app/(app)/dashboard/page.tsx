import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  DollarSign,
  ListChecks,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { CategoryChip, PriorityBadge } from "@/components/badges";
import { ProgressBar, ProgressRing } from "@/components/progress";
import { requireAppContext } from "@/lib/context";
import {
  computeStats,
  listBucketItems,
  listGoals,
  nextMilestones,
  upcomingBucketItems,
} from "@/lib/planner";
import { CATEGORY_LABELS, type Goal } from "@/lib/types";

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

function daysInYear(year: number): number {
  return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const context = await requireAppContext();
  const workspace = context.workspace;
  if (!workspace) {
    return (
      <div className="surface p-8 text-center text-sm text-mist-300">
        No workspace yet. Reload the page to finish provisioning.
      </div>
    );
  }

  const year = new Date().getFullYear();
  const [goals, bucketItems] = await Promise.all([
    listGoals(workspace.id, year),
    listBucketItems(workspace.id),
  ]);
  const stats = computeStats(goals, bucketItems);
  const milestones = nextMilestones(goals, 5);
  const upcoming = upcomingBucketItems(bucketItems, 4);
  const yearProgress = Math.round((dayOfYear(new Date()) / daysInYear(year)) * 100);
  const firstName = context.user.name.split(" ")[0];

  const quarterStats = [1, 2, 3, 4].map((quarter) => {
    const quarterGoals = goals.filter((goal) => goal.quarter === quarter);
    return {
      quarter,
      total: quarterGoals.length,
      done: quarterGoals.filter((goal) => goal.status === "done").length,
      progress:
        quarterGoals.length === 0
          ? 0
          : Math.round(
              quarterGoals.reduce((total, goal) => total + goal.progress, 0) /
                quarterGoals.length,
            ),
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            {workspace.name} · {year}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2 text-sm text-mist-300">
            {stats.goalsTotal === 0
              ? "Your year is a blank page. Add a goal to get moving."
              : `${stats.goalsDone} of ${stats.goalsTotal} goals complete · ${stats.milestonesDone} of ${stats.milestonesTotal} milestones done.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace.role !== "viewer" && (
            <>
              <Link href="/planner" className="btn btn-primary btn-sm">
                <Target size={14} /> Add a goal
              </Link>
              <Link href="/bucket-list" className="btn btn-ghost btn-sm">
                <ListChecks size={14} /> Bucket list
              </Link>
            </>
          )}
        </div>
      </header>

      {workspace.role !== "owner" && (
        <div className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-3 text-sm text-violet-200">
          <Sparkles size={15} className="shrink-0" />
          You are a <strong className="font-semibold">{workspace.role}</strong> in{" "}
          {workspace.ownerEmail}&apos;s workspace.
          {workspace.role === "viewer" ? " Changes are disabled." : " You can edit goals and the bucket list."}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Target}
          label="Goals complete"
          value={`${stats.goalsDone}/${stats.goalsTotal}`}
          hint={`${stats.averageProgress}% average progress`}
          tone="accent"
        />
        <StatCard
          icon={CheckCircle2}
          label="Milestones done"
          value={`${stats.milestonesDone}/${stats.milestonesTotal}`}
          hint="Across this year's goals"
          tone="violet"
        />
        <StatCard
          icon={ListChecks}
          label="Bucket list"
          value={`${stats.bucketDone}/${stats.bucketTotal}`}
          hint={`${upcoming.length} coming up`}
          tone="sky"
        />
        <StatCard
          icon={DollarSign}
          label="Planned adventures"
          value={
            stats.bucketPlannedCost > 0
              ? `$${stats.bucketPlannedCost.toLocaleString("en-US")}`
              : "—"
          }
          hint="Estimated cost of open items"
          tone="amber"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-mist-100">Year at a glance</h2>
              <p className="mt-1 text-xs text-mist-400">
                {yearProgress}% of {year} has passed.
              </p>
            </div>
            <Link
              href="/planner"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-300 hover:text-accent-200"
            >
              Open planner <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row">
            <ProgressRing
              value={stats.averageProgress}
              label="goal progress"
              size={140}
            />
            <div className="w-full flex-1 space-y-4">
              {quarterStats.map((quarter) => (
                <div key={quarter.quarter}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-mist-200">
                      Q{quarter.quarter}
                    </span>
                    <span className="text-mist-500">
                      {quarter.done}/{quarter.total} done
                    </span>
                  </div>
                  <ProgressBar
                    value={quarter.progress}
                    tone={quarter.progress === 100 ? "violet" : "accent"}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-mist-300">
                <TrendingUp size={14} className="text-accent-400" /> Year elapsed
              </span>
              <span className="font-semibold text-mist-200">{yearProgress}%</span>
            </div>
            <ProgressBar value={yearProgress} tone="violet" className="mt-2" />
          </div>
        </div>

        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-mist-100">Next milestones</h2>
            <span className="chip bg-white/[0.06] text-mist-400">
              {milestones.length} open
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {milestones.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-mist-500">
                No open milestones. Add some to your goals, or enjoy the quiet.
              </p>
            )}
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <CircleDashed size={16} className="mt-0.5 shrink-0 text-accent-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-mist-100">
                    {milestone.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-mist-500">
                    {milestone.goalTitle}
                    {milestone.dueDate ? ` · due ${milestone.dueDate}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-mist-100">Goals by quarter</h2>
            <Link
              href={`/planner?year=${year}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-300 hover:text-accent-200"
            >
              All goals <ArrowRight size={13} />
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {goals.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-mist-500">
                No goals for {year} yet.
              </p>
            )}
            {goals.slice(0, 5).map((goal) => (
              <GoalRow key={goal.id} goal={goal} />
            ))}
            {goals.length > 5 && (
              <p className="pt-1 text-center text-[11px] text-mist-500">
                +{goals.length - 5} more in the planner
              </p>
            )}
          </div>
        </div>

        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-mist-100">Coming up</h2>
            <Link
              href="/bucket-list"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-300 hover:text-accent-200"
            >
              Bucket list <ArrowRight size={13} />
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {upcoming.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-mist-500">
                Nothing planned yet. Add the first adventure.
              </p>
            )}
            {upcoming.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-mist-100">{item.title}</p>
                  <PriorityBadge priority={item.priority} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CategoryChip category={item.category} kind="bucket" />
                  <span className="text-[11px] text-mist-500">
                    {item.targetDate
                      ? `Target ${item.targetDate}`
                      : item.targetYear
                        ? `Target ${item.targetYear}`
                        : "No date yet"}
                  </span>
                  {item.estimatedCost !== null && (
                    <span className="text-[11px] text-mist-500">
                      · ${item.estimatedCost.toLocaleString("en-US")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Link
        href="/planner"
        className="group relative block overflow-hidden rounded-2xl border border-accent-400/20 bg-gradient-to-r from-accent-400/10 via-ink-900/40 to-violet-500/10 p-6"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
              <CalendarRange size={16} className="text-accent-300" /> Plan the rest of {year}
            </p>
            <p className="mt-1 text-sm text-mist-400">
              Break the big goals into milestones and let progress update itself.
            </p>
          </div>
          <span className="btn btn-ghost btn-sm self-start sm:self-auto">
            Open yearly planner <ArrowRight size={14} />
          </span>
        </div>
      </Link>
    </div>
  );
}

const TONES = {
  accent: "text-accent-300 bg-accent-400/10 border-accent-400/20",
  violet: "text-violet-300 bg-violet-400/10 border-violet-400/20",
  sky: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  amber: "text-amber-300 bg-amber-400/10 border-amber-400/20",
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  hint: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl border ${TONES[tone]}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-mist-100">{value}</p>
      <p className="text-xs font-medium text-mist-300">{label}</p>
      <p className="mt-1 text-[11px] text-mist-500">{hint}</p>
    </div>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-mist-100">{goal.title}</p>
        <span className="shrink-0 text-[11px] font-semibold text-mist-300">
          {goal.progress}%
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-mist-500">
          Q{goal.quarter} · {CATEGORY_LABELS[goal.category]}
        </span>
        <ProgressBar
          value={goal.progress}
          tone={goal.status === "done" ? "violet" : "accent"}
          className="max-w-28"
        />
      </div>
    </div>
  );
}

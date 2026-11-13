import Link from "next/link";
import { ChevronLeft, ChevronRight, Flag, Target, TrendingUp, Trophy } from "lucide-react";
import { YearPlanner } from "@/components/year-planner";
import { requireAppContext } from "@/lib/context";
import { computeStats, listGoals } from "@/lib/planner";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const context = await requireAppContext();
  const workspace = context.workspace;
  if (!workspace) {
    return (
      <div className="surface p-8 text-center text-sm text-mist-300">
        No workspace available. Reload the page to finish provisioning.
      </div>
    );
  }

  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const requested = Number(params.year);
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : currentYear;

  const goals = await listGoals(workspace.id, year);
  const stats = computeStats(goals, []);
  const canEdit = workspace.role !== "viewer";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            Yearly planner
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Link
              href={`/planner?year=${year - 1}`}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-mist-300 transition hover:text-mist-100"
              aria-label={`Go to ${year - 1}`}
            >
              <ChevronLeft size={16} />
            </Link>
            <h1 className="text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
              {year}
            </h1>
            <Link
              href={`/planner?year=${year + 1}`}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-mist-300 transition hover:text-mist-100"
              aria-label={`Go to ${year + 1}`}
            >
              <ChevronRight size={16} />
            </Link>
            {year !== currentYear && (
              <Link
                href="/planner"
                className="ml-1 text-xs font-semibold text-accent-300 hover:text-accent-200"
              >
                Back to {currentYear}
              </Link>
            )}
          </div>
          <p className="mt-2 text-sm text-mist-300">
            {workspace.name} · {goals.length} goals · {stats.milestonesDone} of{" "}
            {stats.milestonesTotal} milestones done
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill icon={Target} label="Goals" value={`${goals.length}`} />
          <Pill icon={Trophy} label="Done" value={`${stats.goalsDone}`} />
          <Pill icon={TrendingUp} label="Progress" value={`${stats.averageProgress}%`} />
          <Pill icon={Flag} label="Milestones" value={`${stats.milestonesTotal}`} />
        </div>
      </header>

      {!canEdit && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-3 text-sm text-violet-200">
          You have view-only access to {workspace.ownerEmail}&apos;s workspace. Ask the
          owner for editor access to make changes.
        </div>
      )}

      <YearPlanner
        year={year}
        goals={goals}
        canEdit={canEdit}
        pro={context.entitlements.pro}
        goalLimit={context.entitlements.goalLimit}
        workspaceName={workspace.name}
      />
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
      <Icon size={14} className="text-accent-300" />
      <span className="text-mist-500">{label}</span>
      <span className="font-semibold text-mist-100">{value}</span>
    </span>
  );
}

import { Compass, DollarSign, ListChecks, Sparkles } from "lucide-react";
import { BucketBoard } from "@/components/bucket-board";
import { requireAppContext } from "@/lib/context";
import { computeStats, listBucketItems } from "@/lib/planner";

export default async function BucketListPage() {
  const context = await requireAppContext();
  const workspace = context.workspace;
  if (!workspace) {
    return (
      <div className="surface p-8 text-center text-sm text-mist-300">
        No workspace available. Reload the page to finish provisioning.
      </div>
    );
  }

  const items = await listBucketItems(workspace.id);
  const stats = computeStats([], items);
  const canEdit = workspace.role !== "viewer";
  const inProgress = items.filter((item) => item.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            Bucket list
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
            Someday starts here.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-mist-300">
            {stats.bucketTotal === 0
              ? "Capture the trips, skills and experiences you want to collect."
              : `${stats.bucketDone} of ${stats.bucketTotal} done · ${inProgress} in progress · ${stats.bucketTotal - stats.bucketDone} still to go.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Stat icon={ListChecks} label="Items" value={`${stats.bucketTotal}`} />
          <Stat icon={Sparkles} label="Done" value={`${stats.bucketDone}`} />
          <Stat
            icon={DollarSign}
            label="Open budget"
            value={
              stats.bucketPlannedCost > 0
                ? `$${stats.bucketPlannedCost.toLocaleString("en-US")}`
                : "—"
            }
          />
        </div>
      </header>

      {!canEdit && (
        <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-3 text-sm text-violet-200">
          You have view-only access to this workspace.
        </div>
      )}

      <BucketBoard
        items={items}
        canEdit={canEdit}
        pro={context.entitlements.pro}
        bucketLimit={context.entitlements.bucketLimit}
      />

      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-[11px] text-mist-500">
        <Compass size={14} className="text-accent-400" />
        Tip: give an item a target year to surface it in the dashboard&apos;s “Coming up”
        list.
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ListChecks;
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

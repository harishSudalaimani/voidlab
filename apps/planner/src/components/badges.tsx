import {
  BUCKET_CATEGORY_LABELS,
  BUCKET_STATUS_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type BucketCategory,
  type BucketPriority,
  type BucketStatus,
  type GoalCategory,
  type GoalStatus,
  type Role,
} from "@/lib/types";
import { cn } from "@/lib/cn";

const GOAL_STATUS_STYLES: Record<GoalStatus, string> = {
  planned: "bg-white/[0.07] text-mist-300",
  in_progress: "bg-accent-400/15 text-accent-300",
  done: "bg-violet-400/15 text-violet-300",
};

const BUCKET_STATUS_STYLES: Record<BucketStatus, string> = {
  idea: "bg-white/[0.07] text-mist-300",
  planned: "bg-sky-400/15 text-sky-300",
  in_progress: "bg-amber-400/15 text-amber-300",
  done: "bg-emerald-400/15 text-emerald-300",
};

const PRIORITY_STYLES: Record<BucketPriority, string> = {
  high: "bg-rose-500/15 text-rose-300",
  medium: "bg-amber-400/15 text-amber-300",
  low: "bg-white/[0.07] text-mist-400",
};

const CATEGORY_STYLES: Record<string, string> = {
  career: "bg-sky-400/10 text-sky-300 border border-sky-400/20",
  health: "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20",
  finance: "bg-amber-400/10 text-amber-300 border border-amber-400/20",
  learning: "bg-violet-400/10 text-violet-300 border border-violet-400/20",
  relationships: "bg-rose-400/10 text-rose-300 border border-rose-400/20",
  travel: "bg-cyan-400/10 text-cyan-300 border border-cyan-400/20",
  creativity: "bg-fuchsia-400/10 text-fuchsia-300 border border-fuchsia-400/20",
  personal: "bg-white/[0.07] text-mist-300 border border-white/10",
  experience: "bg-orange-400/10 text-orange-300 border border-orange-400/20",
  lifestyle: "bg-lime-400/10 text-lime-300 border border-lime-400/20",
  giving: "bg-pink-400/10 text-pink-300 border border-pink-400/20",
};

const ROLE_STYLES: Record<Role, string> = {
  owner: "bg-accent-400/15 text-accent-300",
  editor: "bg-sky-400/15 text-sky-300",
  viewer: "bg-white/[0.07] text-mist-300",
};

export function GoalStatusBadge({ status }: { status: GoalStatus }) {
  return (
    <span className={cn("chip", GOAL_STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>
  );
}

export function BucketStatusBadge({ status }: { status: BucketStatus }) {
  return (
    <span className={cn("chip", BUCKET_STATUS_STYLES[status])}>
      {BUCKET_STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: BucketPriority }) {
  return (
    <span className={cn("chip", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function CategoryChip({
  category,
  kind = "goal",
}: {
  category: GoalCategory | BucketCategory;
  kind?: "goal" | "bucket";
}) {
  const label =
    kind === "goal"
      ? CATEGORY_LABELS[category as GoalCategory]
      : BUCKET_CATEGORY_LABELS[category as BucketCategory];
  return <span className={cn("chip", CATEGORY_STYLES[category])}>{label}</span>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cn("chip", ROLE_STYLES[role])}>{role}</span>;
}

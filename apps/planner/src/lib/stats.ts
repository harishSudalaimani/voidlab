import type { BucketItem, Goal, Milestone, PlannerStats } from "./types";

export function computeStats(goals: Goal[], bucketItems: BucketItem[]): PlannerStats {
  const milestones = goals.flatMap((goal) => goal.milestones);
  const bucketPlannedCost = bucketItems
    .filter((item) => item.status !== "done" && item.estimatedCost !== null)
    .reduce((total, item) => total + (item.estimatedCost ?? 0), 0);
  return {
    goalsTotal: goals.length,
    goalsDone: goals.filter((goal) => goal.status === "done").length,
    averageProgress:
      goals.length === 0
        ? 0
        : Math.round(goals.reduce((total, goal) => total + goal.progress, 0) / goals.length),
    milestonesTotal: milestones.length,
    milestonesDone: milestones.filter((milestone) => milestone.done).length,
    bucketTotal: bucketItems.length,
    bucketDone: bucketItems.filter((item) => item.status === "done").length,
    bucketPlannedCost: Math.round(bucketPlannedCost),
  };
}

export function nextMilestones(
  goals: Goal[],
  limit = 5,
): Array<Milestone & { goalTitle: string }> {
  return goals
    .flatMap((goal) =>
      goal.milestones
        .filter((milestone) => !milestone.done)
        .map((milestone) => ({ ...milestone, goalTitle: goal.title })),
    )
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, limit);
}

export function upcomingBucketItems(items: BucketItem[], limit = 4): BucketItem[] {
  return items
    .filter((item) => item.status !== "done")
    .sort((a, b) => {
      const aDate = a.targetDate ?? (a.targetYear ? `${a.targetYear}-01-01` : "9999-12-31");
      const bDate = b.targetDate ?? (b.targetYear ? `${b.targetYear}-01-01` : "9999-12-31");
      return aDate.localeCompare(bDate);
    })
    .slice(0, limit);
}

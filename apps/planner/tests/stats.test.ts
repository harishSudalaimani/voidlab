import { describe, expect, it } from "vitest";
import { computeStats, nextMilestones, upcomingBucketItems } from "@/lib/stats";
import type { BucketItem, Goal, Milestone } from "@/lib/types";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? "Milestone",
    done: overrides.done ?? false,
    dueDate: overrides.dueDate ?? null,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: "11111111-1111-4111-8111-111111111111",
    year: 2026,
    quarter: 1,
    title: overrides.title ?? "Goal",
    description: "",
    category: "personal",
    status: "planned",
    progress: 0,
    milestones: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function bucketItem(overrides: Partial<BucketItem> = {}): BucketItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspaceId: "11111111-1111-4111-8111-111111111111",
    title: overrides.title ?? "Item",
    description: "",
    category: "travel",
    status: "idea",
    priority: "medium",
    targetYear: null,
    targetDate: null,
    estimatedCost: null,
    link: null,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeStats", () => {
  it("aggregates goals, milestones and bucket items", () => {
    const goals = [
      goal({
        status: "done",
        progress: 100,
        milestones: [milestone({ done: true }), milestone({ done: true })],
      }),
      goal({ status: "in_progress", progress: 50, milestones: [milestone({ done: true })] }),
    ];
    const items = [
      bucketItem({ status: "done", estimatedCost: 100 }),
      bucketItem({ status: "planned", estimatedCost: 250.4 }),
      bucketItem({ status: "idea", estimatedCost: null }),
    ];

    expect(computeStats(goals, items)).toEqual({
      goalsTotal: 2,
      goalsDone: 1,
      averageProgress: 75,
      milestonesTotal: 3,
      milestonesDone: 3,
      bucketTotal: 3,
      bucketDone: 1,
      bucketPlannedCost: 250,
    });
  });

  it("returns zeroed stats for an empty planner", () => {
    expect(computeStats([], [])).toEqual({
      goalsTotal: 0,
      goalsDone: 0,
      averageProgress: 0,
      milestonesTotal: 0,
      milestonesDone: 0,
      bucketTotal: 0,
      bucketDone: 0,
      bucketPlannedCost: 0,
    });
  });
});

describe("nextMilestones", () => {
  it("orders dated milestones first, then undated by sort order and respects the limit", () => {
    const goals = [
      goal({
        title: "Health",
        milestones: [
          milestone({ id: "no-date-2", title: "Stretch", sortOrder: 2 }),
          milestone({ id: "late", title: "Race", dueDate: "2026-09-01", sortOrder: 0 }),
          milestone({ id: "no-date-1", title: "Mobility", sortOrder: 1 }),
          milestone({ id: "early", title: "10k", dueDate: "2026-04-01", sortOrder: 3 }),
          milestone({ id: "done", done: true }),
        ],
      }),
    ];

    const result = nextMilestones(goals, 4);
    expect(result.map((entry) => entry.id)).toEqual([
      "early",
      "late",
      "no-date-1",
      "no-date-2",
    ]);
    expect(result[0].goalTitle).toBe("Health");
  });
});

describe("upcomingBucketItems", () => {
  it("excludes completed items and sorts by the nearest date", () => {
    const items = [
      bucketItem({ id: "no-date", targetDate: null, targetYear: null }),
      bucketItem({ id: "year-only", targetYear: 2028 }),
      bucketItem({ id: "dated", targetDate: "2027-02-10", targetYear: 2027 }),
      bucketItem({ id: "done", status: "done", targetDate: "2026-01-01" }),
    ];

    expect(upcomingBucketItems(items).map((item) => item.id)).toEqual([
      "dated",
      "year-only",
      "no-date",
    ]);
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 6 }, (_, index) =>
      bucketItem({ id: `item-${index}`, targetYear: 2027 + index }),
    );
    expect(upcomingBucketItems(items, 2)).toHaveLength(2);
  });
});

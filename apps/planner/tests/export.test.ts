import { describe, expect, it } from "vitest";
import { bucketToCsv, goalsToCsv } from "@/lib/export";
import type { BucketItem, Goal } from "@/lib/types";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "a1000000-0000-4000-8000-000000000001",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    year: 2026,
    quarter: 2,
    title: "Goal",
    description: "",
    category: "career",
    status: "in_progress",
    progress: 50,
    milestones: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function bucketItem(overrides: Partial<BucketItem> = {}): BucketItem {
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    workspaceId: "11111111-1111-4111-8111-111111111111",
    title: "Item",
    description: "",
    category: "travel",
    status: "planned",
    priority: "high",
    targetYear: 2027,
    targetDate: "2027-02-10",
    estimatedCost: 3200,
    link: null,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CSV export", () => {
  it("writes goal rows with milestone counts", () => {
    const csv = goalsToCsv([
      goal({
        title: 'Ship "Northstar", v1',
        description: "Line one\nline two",
        milestones: [
          { id: "1", title: "One", done: true, dueDate: null, sortOrder: 0 },
          { id: "2", title: "Two", done: false, dueDate: null, sortOrder: 1 },
        ],
      }),
    ]);

    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "year,quarter,title,description,category,status,progress,milestones_done,milestones_total",
    );
    expect(csv).toContain('"Ship ""Northstar"", v1"');
    expect(csv).toContain('"Line one\nline two"');
    expect(csv).toContain("2026,2");
    expect(csv).toContain("1,2");
  });

  it("writes bucket rows and escapes commas", () => {
    const csv = bucketToCsv([
      bucketItem({ title: "Northern lights", description: "Tromsø, Norway" }),
    ]);
    expect(csv.split("\n")[0]).toContain("target_year,target_date");
    expect(csv).toContain('"Tromsø, Norway"');
    expect(csv).toContain("2027,2027-02-10,3200");
  });

  it("renders null values as empty cells", () => {
    const csv = bucketToCsv([bucketItem({ estimatedCost: null, link: null, targetDate: null })]);
    expect(csv.split("\n")[1]).toBe("Item,,travel,planned,high,2027,,,");
  });
});

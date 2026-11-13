import type { BucketItem, Goal } from "./types";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function goalsToCsv(goals: Goal[]): string {
  return toCsv(
    ["year", "quarter", "title", "description", "category", "status", "progress", "milestones_done", "milestones_total"],
    goals.map((goal) => [
      goal.year,
      goal.quarter,
      goal.title,
      goal.description,
      goal.category,
      goal.status,
      goal.progress,
      goal.milestones.filter((milestone) => milestone.done).length,
      goal.milestones.length,
    ]),
  );
}

export function bucketToCsv(items: BucketItem[]): string {
  return toCsv(
    ["title", "description", "category", "status", "priority", "target_year", "target_date", "estimated_cost", "link"],
    items.map((item) => [
      item.title,
      item.description,
      item.category,
      item.status,
      item.priority,
      item.targetYear,
      item.targetDate,
      item.estimatedCost,
      item.link,
    ]),
  );
}

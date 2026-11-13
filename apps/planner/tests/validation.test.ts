import { describe, expect, it } from "vitest";
import {
  bucketCreateSchema,
  bucketUpdateSchema,
  goalCreateSchema,
  goalUpdateSchema,
  inviteSchema,
} from "@/lib/validation";

describe("goalCreateSchema", () => {
  it("applies planner defaults", () => {
    const goal = goalCreateSchema.parse({
      year: "2026",
      quarter: "2",
      title: "  Run a half marathon  ",
    });
    expect(goal).toMatchObject({
      year: 2026,
      quarter: 2,
      title: "Run a half marathon",
      category: "personal",
      status: "planned",
      progress: 0,
    });
  });

  it("rejects an empty title and an invalid quarter", () => {
    expect(() =>
      goalCreateSchema.parse({ year: 2026, quarter: 1, title: "   " }),
    ).toThrow();
    expect(() =>
      goalCreateSchema.parse({ year: 2026, quarter: 5, title: "Read more" }),
    ).toThrow();
  });
});

describe("goalUpdateSchema", () => {
  it("accepts a partial update", () => {
    expect(goalUpdateSchema.parse({ progress: 75 })).toEqual({ progress: 75 });
  });

  it("rejects an empty update", () => {
    expect(() => goalUpdateSchema.parse({})).toThrow();
  });
});

describe("bucketCreateSchema", () => {
  it("accepts a full item and coerces numbers", () => {
    const item = bucketCreateSchema.parse({
      title: "See the northern lights",
      status: "planned",
      priority: "high",
      targetYear: "2027",
      targetDate: "2027-02-10",
      estimatedCost: "3200",
    });
    expect(item.targetYear).toBe(2027);
    expect(item.estimatedCost).toBe(3200);
  });

  it("rejects a malformed date", () => {
    expect(() =>
      bucketCreateSchema.parse({ title: "Trip", targetDate: "10/02/2027" }),
    ).toThrow();
  });
});

describe("bucketUpdateSchema", () => {
  it("rejects an empty update", () => {
    expect(() => bucketUpdateSchema.parse({})).toThrow();
  });
});

describe("inviteSchema", () => {
  it("normalises the invited email", () => {
    expect(inviteSchema.parse({ email: "  Friend@Example.COM ", role: "editor" })).toEqual({
      email: "friend@example.com",
      role: "editor",
    });
  });

  it("rejects owner as an invite role", () => {
    expect(() => inviteSchema.parse({ email: "a@b.co", role: "owner" })).toThrow();
  });
});

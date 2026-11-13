import { z } from "zod";
import {
  BUCKET_CATEGORIES,
  BUCKET_PRIORITIES,
  BUCKET_STATUSES,
  GOAL_CATEGORIES,
  GOAL_STATUSES,
} from "./types";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable();

const optionalText = z.string().trim().max(2000).optional();

export const goalCreateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
  title: z.string().trim().min(1, "Give the goal a title").max(160),
  description: optionalText,
  category: z.enum(GOAL_CATEGORIES).default("personal"),
  status: z.enum(GOAL_STATUSES).default("planned"),
  progress: z.coerce.number().int().min(0).max(100).default(0),
});

export const goalUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000),
    category: z.enum(GOAL_CATEGORIES),
    status: z.enum(GOAL_STATUSES),
    progress: z.coerce.number().int().min(0).max(100),
    quarter: z.coerce.number().int().min(1).max(4),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export const milestoneCreateSchema = z.object({
  title: z.string().trim().min(1, "Give the milestone a title").max(160),
  dueDate: dateString.optional(),
});

export const milestoneUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    done: z.boolean(),
    dueDate: dateString,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

const bucketFields = z.object({
  title: z.string().trim().min(1, "Give the item a title").max(160),
  description: optionalText,
  category: z.enum(BUCKET_CATEGORIES),
  status: z.enum(BUCKET_STATUSES),
  priority: z.enum(BUCKET_PRIORITIES),
  targetYear: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  targetDate: dateString.optional(),
  estimatedCost: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
  link: z.string().trim().max(500).nullable().optional(),
});

export const bucketCreateSchema = bucketFields.extend({
  category: bucketFields.shape.category.default("travel"),
  status: bucketFields.shape.status.default("idea"),
  priority: bucketFields.shape.priority.default("medium"),
});

export const bucketUpdateSchema = bucketFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["editor", "viewer"]),
});

export const memberUpdateSchema = z.object({
  role: z.enum(["editor", "viewer"]),
});

export const workspaceRenameSchema = z.object({
  name: z.string().trim().min(1, "Name the workspace").max(80),
});

export type GoalCreateInput = z.infer<typeof goalCreateSchema>;
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;
export type BucketCreateInput = z.infer<typeof bucketCreateSchema>;
export type BucketUpdateInput = z.infer<typeof bucketUpdateSchema>;

export const GOAL_CATEGORIES = [
  "career",
  "health",
  "finance",
  "learning",
  "relationships",
  "travel",
  "creativity",
  "personal",
] as const;

export const GOAL_STATUSES = ["planned", "in_progress", "done"] as const;

export const BUCKET_STATUSES = ["idea", "planned", "in_progress", "done"] as const;

export const BUCKET_PRIORITIES = ["low", "medium", "high"] as const;

export const BUCKET_CATEGORIES = [
  "travel",
  "experience",
  "learning",
  "health",
  "creativity",
  "career",
  "lifestyle",
  "giving",
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type BucketStatus = (typeof BUCKET_STATUSES)[number];
export type BucketPriority = (typeof BUCKET_PRIORITIES)[number];
export type BucketCategory = (typeof BUCKET_CATEGORIES)[number];
export type Tier = "free" | "pro";
export type Role = "owner" | "editor" | "viewer";

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  tier: Tier;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  isPersonal: boolean;
  role: Role;
}

export interface WorkspaceMember {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  userId: string | null;
  createdAt: string;
}

export interface Entitlements {
  tier: Tier;
  pro: boolean;
  canCollaborate: boolean;
  canExport: boolean;
  goalLimit: number | null;
  bucketLimit: number | null;
}

export interface AppContext {
  user: AppUser;
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary | null;
  entitlements: Entitlements;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  sortOrder: number;
}

export interface Goal {
  id: string;
  workspaceId: string;
  year: number;
  quarter: number;
  title: string;
  description: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: number;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export interface BucketItem {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  category: BucketCategory;
  status: BucketStatus;
  priority: BucketPriority;
  targetYear: number | null;
  targetDate: string | null;
  estimatedCost: number | null;
  link: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerStats {
  goalsTotal: number;
  goalsDone: number;
  averageProgress: number;
  milestonesTotal: number;
  milestonesDone: number;
  bucketTotal: number;
  bucketDone: number;
  bucketPlannedCost: number;
}

export const CATEGORY_LABELS: Record<GoalCategory, string> = {
  career: "Career",
  health: "Health",
  finance: "Finance",
  learning: "Learning",
  relationships: "Relationships",
  travel: "Travel",
  creativity: "Creativity",
  personal: "Personal",
};

export const BUCKET_CATEGORY_LABELS: Record<BucketCategory, string> = {
  travel: "Travel",
  experience: "Experience",
  learning: "Learning",
  health: "Health",
  creativity: "Creativity",
  career: "Career",
  lifestyle: "Lifestyle",
  giving: "Giving",
};

export const STATUS_LABELS: Record<GoalStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

export const BUCKET_STATUS_LABELS: Record<BucketStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

export const PRIORITY_LABELS: Record<BucketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

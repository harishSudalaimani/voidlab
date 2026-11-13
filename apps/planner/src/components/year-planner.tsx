"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Check,
  Flag,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { CategoryChip, GoalStatusBadge } from "@/components/badges";
import { ProgressBar } from "@/components/progress";
import { ErrorBanner, Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client";
import {
  CATEGORY_LABELS,
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  STATUS_LABELS,
  type Goal,
  type GoalCategory,
  type GoalStatus,
} from "@/lib/types";

interface YearPlannerProps {
  year: number;
  goals: Goal[];
  canEdit: boolean;
  pro: boolean;
  goalLimit: number | null;
  workspaceName: string;
}

export function YearPlanner({
  year,
  goals,
  canEdit,
  pro,
  goalLimit,
  workspaceName,
}: YearPlannerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [createQuarter, setCreateQuarter] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;

  function refresh() {
    startTransition(() => router.refresh());
  }

  const overLimit = !pro && goalLimit !== null && goals.length >= goalLimit;

  return (
    <>
      {!pro && canEdit && (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs",
            overLimit
              ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
              : "border-white/10 bg-white/[0.03] text-mist-400",
          )}
        >
          <span className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent-300" />
            {overLimit
              ? `Free plan limit reached (${goalLimit} goals in ${year}). Upgrade for unlimited goals.`
              : `${goalLimit} goals included on Free. Pro removes the cap and adds collaboration.`}
          </span>
          <a href="/settings#billing" className="font-semibold text-accent-300 hover:text-accent-200">
            Upgrade to Pro
          </a>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((quarter) => {
          const quarterGoals = goals.filter((goal) => goal.quarter === quarter);
          return (
            <section key={quarter} className="surface flex min-h-64 flex-col p-3.5">
              <div className="mb-3 flex items-center justify-between px-0.5">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-bold text-mist-100">Q{quarter}</h2>
                  <span className="text-[11px] text-mist-500">
                    {quarterGoals.length} {quarterGoals.length === 1 ? "goal" : "goals"}
                  </span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setCreateQuarter(quarter)}
                    className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-mist-300 transition hover:border-accent-400/40 hover:text-accent-300"
                    aria-label={`Add a Q${quarter} goal`}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {quarterGoals.length === 0 && (
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => canEdit && setCreateQuarter(quarter)}
                    className={cn(
                      "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-8 text-center transition",
                      canEdit && "hover:border-accent-400/30 hover:bg-white/[0.03]",
                    )}
                  >
                    <CalendarRange size={18} className="text-mist-600" />
                    <span className="text-[11px] text-mist-500">
                      {canEdit ? `Add a Q${quarter} goal` : "No goals yet"}
                    </span>
                  </button>
                )}

                {quarterGoals.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setSelectedId(goal.id)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-accent-400/30 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug text-mist-100">
                        {goal.title}
                      </p>
                      <GoalStatusBadge status={goal.status} />
                    </div>
                    {goal.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-mist-400">
                        {goal.description}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[10px] text-mist-500">
                      <CategoryChip category={goal.category} />
                      <span>
                        {goal.milestones.filter((milestone) => milestone.done).length}/
                        {goal.milestones.length} milestones
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar
                        value={goal.progress}
                        tone={goal.status === "done" ? "violet" : "accent"}
                      />
                      <span className="w-8 shrink-0 text-right text-[10px] font-semibold text-mist-400">
                        {goal.progress}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <GoalCreateModal
        key={createQuarter ?? "closed"}
        open={createQuarter !== null}
        year={year}
        quarter={createQuarter ?? 1}
        onClose={() => setCreateQuarter(null)}
        onCreated={() => {
          setCreateQuarter(null);
          refresh();
        }}
      />

      {selectedGoal && (
        <GoalDrawer
          key={`${selectedGoal.id}-${selectedGoal.updatedAt}`}
          goal={selectedGoal}
          canEdit={canEdit}
          workspaceName={workspaceName}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

function GoalCreateModal({
  open,
  year,
  quarter,
  onClose,
  onCreated,
}: {
  open: boolean;
  year: number;
  quarter: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GoalCategory>("personal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/goals", {
        method: "POST",
        body: JSON.stringify({ year, quarter, title, description, category }),
      });
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create goal");
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`New Q${quarter} goal`}
      description={`Everything you add lands in the ${year} planner.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="goal-title">
            Goal
          </label>
          <input
            id="goal-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Run a sub-2h half marathon"
            maxLength={160}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="goal-description">
            Why it matters
          </label>
          <textarea
            id="goal-description"
            className="input min-h-24 resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A sentence or two about the outcome you want."
            maxLength={2000}
          />
        </div>
        <div>
          <label className="label" htmlFor="goal-category">
            Category
          </label>
          <select
            id="goal-category"
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value as GoalCategory)}
          >
            {GOAL_CATEGORIES.map((option) => (
              <option key={option} value={option} className="bg-ink-900">
                {CATEGORY_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <ErrorBanner message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner /> : <Plus size={15} />}
            Add goal
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GoalDrawer({
  goal,
  canEdit,
  workspaceName,
  onClose,
  onChanged,
}: {
  goal: Goal;
  canEdit: boolean;
  workspaceName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description);
  const [category, setCategory] = useState<GoalCategory>(goal.category);
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [progress, setProgress] = useState(goal.progress);
  const [quarter, setQuarter] = useState(goal.quarter);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneSaving, setMilestoneSaving] = useState(false);

  const [milestones, setMilestones] = useState(goal.milestones);
  useEffect(() => {
    setMilestones(goal.milestones);
  }, [goal.milestones]);

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, description, category, status, progress, quarter }),
      });
      onChanged();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save goal");
    } finally {
      setSaving(false);
    }
  }

  async function deleteGoal() {
    if (!window.confirm("Delete this goal and all of its milestones?")) return;
    setSaving(true);
    try {
      await apiFetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      onClose();
      onChanged();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete goal");
      setSaving(false);
    }
  }

  async function addMilestone(event: React.FormEvent) {
    event.preventDefault();
    if (!milestoneTitle.trim()) return;
    setMilestoneSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{
        milestone: {
          id: string;
          title: string;
          done: boolean;
          due_date: string | null;
          sort_order: number;
        };
      }>(`/api/goals/${goal.id}/milestones`, {
        method: "POST",
        body: JSON.stringify({
          title: milestoneTitle,
          dueDate: milestoneDate || null,
        }),
      });
      setMilestones((current) => [
        ...current,
        {
          id: data.milestone.id,
          title: data.milestone.title,
          done: data.milestone.done,
          dueDate: data.milestone.due_date,
          sortOrder: data.milestone.sort_order,
        },
      ]);
      setMilestoneTitle("");
      setMilestoneDate("");
      onChanged();
    } catch (milestoneError) {
      setError(
        milestoneError instanceof Error ? milestoneError.message : "Could not add milestone",
      );
    } finally {
      setMilestoneSaving(false);
    }
  }

  async function toggleMilestone(id: string, done: boolean) {
    setMilestones((current) =>
      current.map((milestone) => (milestone.id === id ? { ...milestone, done } : milestone)),
    );
    try {
      await apiFetch(`/api/milestones/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ done }),
      });
      onChanged();
    } catch (toggleError) {
      setMilestones((current) =>
        current.map((milestone) =>
          milestone.id === id ? { ...milestone, done: !done } : milestone,
        ),
      );
      setError(toggleError instanceof Error ? toggleError.message : "Could not update");
    }
  }

  async function removeMilestone(id: string) {
    setMilestones((current) => current.filter((milestone) => milestone.id !== id));
    try {
      await apiFetch(`/api/milestones/${id}`, { method: "DELETE" });
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove");
      onChanged();
    }
  }

  const doneCount = milestones.filter((milestone) => milestone.done).length;

  return (
    <Modal
      open
      onClose={onClose}
      title={goal.title}
      description={`${workspaceName} · Q${goal.quarter} · ${CATEGORY_LABELS[goal.category]}`}
      wide
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <GoalStatusBadge status={status} />
          <span className="text-xs text-mist-500">
            {doneCount}/{milestones.length} milestones complete
          </span>
        </div>

        {canEdit ? (
          <form onSubmit={saveGoal} className="space-y-4">
            <div>
              <label className="label" htmlFor="edit-title">
                Goal
              </label>
              <input
                id="edit-title"
                className="input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="edit-description">
                Notes
              </label>
              <textarea
                id="edit-description"
                className="input min-h-20 resize-y"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="edit-quarter">
                  Quarter
                </label>
                <select
                  id="edit-quarter"
                  className="input"
                  value={quarter}
                  onChange={(event) => setQuarter(Number(event.target.value))}
                >
                  {[1, 2, 3, 4].map((option) => (
                    <option key={option} value={option} className="bg-ink-900">
                      Q{option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="edit-category">
                  Category
                </label>
                <select
                  id="edit-category"
                  className="input"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as GoalCategory)}
                >
                  {GOAL_CATEGORIES.map((option) => (
                    <option key={option} value={option} className="bg-ink-900">
                      {CATEGORY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="edit-status">
                  Status
                </label>
                <select
                  id="edit-status"
                  className="input"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as GoalStatus)}
                >
                  {GOAL_STATUSES.map((option) => (
                    <option key={option} value={option} className="bg-ink-900">
                      {STATUS_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label mb-0" htmlFor="edit-progress">
                  Progress
                </label>
                <span className="text-xs font-semibold text-mist-300">{progress}%</span>
              </div>
              <input
                id="edit-progress"
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(event) => setProgress(Number(event.target.value))}
                className="mt-2 w-full accent-emerald-400"
              />
              {milestones.length > 0 && (
                <p className="field-hint">
                  Toggling milestones also recalculates progress automatically.
                </p>
              )}
            </div>
            <ErrorBanner message={error} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={deleteGoal} className="btn btn-danger btn-sm">
                <Trash2 size={14} /> Delete goal
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn btn-ghost">
                  Close
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Save changes
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {goal.description && (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-relaxed text-mist-300">
                {goal.description}
              </p>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-mist-400">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <ProgressBar value={progress} />
            </div>
            <p className="text-xs text-mist-500">You have view-only access to this workspace.</p>
          </div>
        )}

        <section className="border-t border-white/10 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-mist-100">
            <Flag size={15} className="text-accent-300" /> Milestones
          </h3>

          <div className="mt-3 space-y-2">
            {milestones.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-mist-500">
                No milestones yet.
              </p>
            )}
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleMilestone(milestone.id, !milestone.done)}
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-md border transition",
                    milestone.done
                      ? "border-accent-400 bg-accent-400 text-ink-950"
                      : "border-white/20 text-transparent hover:border-accent-400/60",
                    !canEdit && "cursor-default",
                  )}
                  aria-label={milestone.done ? "Mark incomplete" : "Mark complete"}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      milestone.done ? "text-mist-500 line-through" : "text-mist-200",
                    )}
                  >
                    {milestone.title}
                  </p>
                  {milestone.dueDate && (
                    <p className="text-[10px] text-mist-500">Due {milestone.dueDate}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(milestone.id)}
                    className="rounded-lg p-1.5 text-mist-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label="Delete milestone"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <form onSubmit={addMilestone} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                value={milestoneTitle}
                onChange={(event) => setMilestoneTitle(event.target.value)}
                placeholder="Add a milestone…"
                maxLength={160}
              />
              <input
                type="date"
                className="input sm:w-40"
                value={milestoneDate}
                onChange={(event) => setMilestoneDate(event.target.value)}
                aria-label="Milestone due date"
              />
              <button
                type="submit"
                className="btn btn-ghost shrink-0"
                disabled={milestoneSaving || !milestoneTitle.trim()}
              >
                {milestoneSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add
              </button>
            </form>
          )}
        </section>
      </div>
    </Modal>
  );
}

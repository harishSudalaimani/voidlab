"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  DollarSign,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  BucketStatusBadge,
  CategoryChip,
  PriorityBadge,
} from "@/components/badges";
import { ErrorBanner, Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client";
import {
  BUCKET_CATEGORIES,
  BUCKET_CATEGORY_LABELS,
  BUCKET_PRIORITIES,
  BUCKET_STATUSES,
  BUCKET_STATUS_LABELS,
  PRIORITY_LABELS,
  type BucketCategory,
  type BucketItem,
  type BucketPriority,
  type BucketStatus,
} from "@/lib/types";

interface BucketBoardProps {
  items: BucketItem[];
  canEdit: boolean;
  pro: boolean;
  bucketLimit: number | null;
}

const FILTERS: Array<{ key: "all" | BucketStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "idea", label: "Ideas" },
  { key: "planned", label: "Planned" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export function BucketBoard({ items, canEdit, pro, bucketLimit }: BucketBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | BucketStatus>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | BucketCategory>("all");
  const [editing, setEditing] = useState<BucketItem | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overLimit = !pro && bucketLimit !== null && items.length >= bucketLimit;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (category !== "all" && item.category !== category) return false;
      if (
        needle &&
        !`${item.title} ${item.description}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [items, filter, category, query]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function toggleDone(item: BucketItem) {
    if (!canEdit) return;
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch(`/api/bucket/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: item.status === "done" ? "planned" : "done" }),
      });
      refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update item");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: BucketItem) {
    if (!window.confirm(`Remove “${item.title}” from the bucket list?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch(`/api/bucket/${item.id}`, { method: "DELETE" });
      refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not delete item");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {FILTERS.map((entry) => {
            const count =
              entry.key === "all"
                ? items.length
                : items.filter((item) => item.status === entry.key).length;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  filter === entry.key
                    ? "bg-white/10 text-mist-100"
                    : "text-mist-400 hover:text-mist-200",
                )}
              >
                {entry.label}
                <span className="ml-1.5 text-[10px] text-mist-500">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 sm:flex-none">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the list"
              className="input py-2 pl-8 text-xs"
              aria-label="Search bucket list"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as "all" | BucketCategory)}
            className="input w-auto py-2 text-xs"
            aria-label="Filter by category"
          >
            <option value="all" className="bg-ink-900">
              All categories
            </option>
            {BUCKET_CATEGORIES.map((option) => (
              <option key={option} value={option} className="bg-ink-900">
                {BUCKET_CATEGORY_LABELS[option]}
              </option>
            ))}
          </select>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} /> Add item
            </button>
          )}
        </div>
      </div>

      {!pro && canEdit && overLimit && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
          <span>
            Free plan limit reached ({bucketLimit} items). Upgrade to Pro for an unlimited
            bucket list.
          </span>
          <a href="/settings#billing" className="font-semibold text-accent-300">
            Upgrade
          </a>
        </div>
      )}
      <ErrorBanner message={error} />

      {visible.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 p-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-mist-500">
            <CalendarDays size={22} />
          </span>
          <p className="text-sm font-semibold text-mist-200">
            {items.length === 0 ? "Your bucket list is empty" : "Nothing matches those filters"}
          </p>
          <p className="max-w-sm text-xs text-mist-500">
            {items.length === 0
              ? "Add the first thing you want to do — a trip, a skill, a ridiculous idea."
              : "Try a different status, category or search."}
          </p>
          {canEdit && items.length === 0 && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="btn btn-primary btn-sm mt-1"
            >
              <Plus size={14} /> Add the first item
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <article
              key={item.id}
              className={cn(
                "surface group flex flex-col p-4 transition hover:border-white/20",
                item.status === "done" && "opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <BucketStatusBadge status={item.status} />
                  <PriorityBadge priority={item.priority} />
                </div>
                <button
                  type="button"
                  disabled={!canEdit || busyId === item.id}
                  onClick={() => toggleDone(item)}
                  className={cn(
                    "rounded-lg p-1.5 transition",
                    item.status === "done"
                      ? "text-emerald-300 hover:bg-emerald-400/10"
                      : "text-mist-500 hover:bg-white/10 hover:text-mist-200",
                    !canEdit && "cursor-default opacity-50",
                  )}
                  aria-label={item.status === "done" ? "Mark as planned" : "Mark as done"}
                  title={item.status === "done" ? "Mark as planned" : "Mark as done"}
                >
                  {busyId === item.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : item.status === "done" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                </button>
              </div>

              <h3
                className={cn(
                  "mt-3 text-base font-semibold leading-snug text-mist-100",
                  item.status === "done" && "line-through decoration-mist-600",
                )}
              >
                {item.title}
              </h3>
              {item.description && (
                <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-mist-400">
                  {item.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CategoryChip category={item.category} kind="bucket" />
                {(item.targetDate || item.targetYear) && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-mist-500">
                    <CalendarDays size={12} />
                    {item.targetDate ?? item.targetYear}
                  </span>
                )}
                {item.estimatedCost !== null && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-mist-500">
                    <DollarSign size={12} />
                    {item.estimatedCost.toLocaleString("en-US")}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-300 hover:text-accent-200"
                  >
                    <ExternalLink size={12} /> Open link
                  </a>
                ) : (
                  <span className="text-[11px] text-mist-600">No link</span>
                )}
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="rounded-lg p-1.5 text-mist-500 transition hover:bg-white/10 hover:text-mist-200"
                      aria-label={`Edit ${item.title}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      className="rounded-lg p-1.5 text-mist-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                      aria-label={`Delete ${item.title}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing !== null && (
        <BucketForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function BucketForm({
  item,
  onClose,
  onSaved,
}: {
  item: BucketItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState<BucketCategory>(item?.category ?? "travel");
  const [status, setStatus] = useState<BucketStatus>(item?.status ?? "idea");
  const [priority, setPriority] = useState<BucketPriority>(item?.priority ?? "medium");
  const [targetYear, setTargetYear] = useState(
    item?.targetYear ? String(item.targetYear) : "",
  );
  const [targetDate, setTargetDate] = useState(item?.targetDate ?? "");
  const [estimatedCost, setEstimatedCost] = useState(
    item?.estimatedCost !== null && item?.estimatedCost !== undefined
      ? String(item.estimatedCost)
      : "",
  );
  const [link, setLink] = useState(item?.link ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      title,
      description,
      category,
      status,
      priority,
      targetYear: targetYear.trim() === "" ? null : Number(targetYear),
      targetDate: targetDate === "" ? null : targetDate,
      estimatedCost: estimatedCost.trim() === "" ? null : Number(estimatedCost),
      link: link.trim() === "" ? null : link.trim(),
    };

    try {
      await apiFetch(item ? `/api/bucket/${item.id}` : "/api/bucket", {
        method: item ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save the item",
      );
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit bucket list item" : "Add to the bucket list"}
      description={item ? item.title : "A trip, a skill, a slightly ridiculous idea."}
      wide
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="bucket-title">
            What do you want to do?
          </label>
          <input
            id="bucket-title"
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. See the northern lights"
            maxLength={160}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="bucket-description">
            Notes
          </label>
          <textarea
            id="bucket-description"
            className="input min-h-20 resize-y"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            placeholder="Where, when, with whom?"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="bucket-category">
              Category
            </label>
            <select
              id="bucket-category"
              className="input"
              value={category}
              onChange={(event) => setCategory(event.target.value as BucketCategory)}
            >
              {BUCKET_CATEGORIES.map((option) => (
                <option key={option} value={option} className="bg-ink-900">
                  {BUCKET_CATEGORY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bucket-status">
              Status
            </label>
            <select
              id="bucket-status"
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as BucketStatus)}
            >
              {BUCKET_STATUSES.map((option) => (
                <option key={option} value={option} className="bg-ink-900">
                  {BUCKET_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bucket-priority">
              Priority
            </label>
            <select
              id="bucket-priority"
              className="input"
              value={priority}
              onChange={(event) => setPriority(event.target.value as BucketPriority)}
            >
              {BUCKET_PRIORITIES.map((option) => (
                <option key={option} value={option} className="bg-ink-900">
                  {PRIORITY_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="bucket-year">
              Target year
            </label>
            <input
              id="bucket-year"
              type="number"
              min={2000}
              max={2100}
              className="input"
              value={targetYear}
              onChange={(event) => setTargetYear(event.target.value)}
              placeholder="2027"
            />
          </div>
          <div>
            <label className="label" htmlFor="bucket-date">
              Exact date
            </label>
            <input
              id="bucket-date"
              type="date"
              className="input"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bucket-cost">
              Estimated cost (USD)
            </label>
            <input
              id="bucket-cost"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={estimatedCost}
              onChange={(event) => setEstimatedCost(event.target.value)}
              placeholder="2500"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bucket-link">
            Link
          </label>
          <input
            id="bucket-link"
            type="url"
            className="input"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://…"
          />
        </div>
        <ErrorBanner message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner /> : <Plus size={15} />}
            {item ? "Save changes" : "Add to list"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

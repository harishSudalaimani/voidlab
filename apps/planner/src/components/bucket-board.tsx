"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiFetch } from "@/lib/client";
import type { BucketItem, BucketStatus } from "@/lib/types";

interface BucketBoardProps {
  items: BucketItem[];
  canEdit: boolean;
}

export function BucketBoard({ items, canEdit }: BucketBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [title, setTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const years = useMemo(() => [...new Set([
    currentYear,
    ...Array.from({ length: 10 }, (_, index) => currentYear + index + 1),
    ...items.map((item) => item.targetYear).filter((value): value is number => value !== null && value !== undefined),
  ])].sort((left, right) => right - left), [currentYear, items]);
  const visibleItems = items.filter((item) => (item.targetYear ?? currentYear) === year);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = title.trim();
    if (!name || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/bucket", {
        method: "POST",
        body: JSON.stringify({ title: name, targetYear: year }),
      });
      setTitle("");
      refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add this item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: BucketItem) {
    if (!canEdit) return;
    setBusyId(item.id);
    setError("");
    const status: BucketStatus = item.status === "done" ? "planned" : "done";
    try {
      await apiFetch(`/api/bucket/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: BucketItem) {
    if (!canEdit) return;
    setBusyId(item.id);
    setError("");
    try {
      await apiFetch(`/api/bucket/${item.id}`, { method: "DELETE" });
      refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove this item.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bucket-year-board" aria-label={`Bucket list for ${year}`}>
      <div className="bucket-year-heading">
        <h2>{year}</h2>
        <label><span>Year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Bucket list year">
          {years.map((option) => <option key={option} value={option}>{option}</option>)}
        </select></label>
      </div>

      {canEdit && <form className="bucket-year-form" onSubmit={addItem}>
        <label className="sr-only" htmlFor="bucket-year-new-item">Add to your bucket list</label>
        <input id="bucket-year-new-item" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Add something for ${year}…`} maxLength={160} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !title.trim()}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add</button>
      </form>}

      {error && <p className="bucket-year-error" role="status">{error}</p>}
      {visibleItems.length ? (
        <ul className="bucket-year-list">
          {visibleItems.map((item) => (
            <li key={item.id} className={cn(item.status === "done" && "is-done")}>
              <button type="button" disabled={!canEdit || busyId === item.id} onClick={() => void toggleItem(item)} aria-label={item.status === "done" ? `Reopen ${item.title}` : `Complete ${item.title}`} aria-pressed={item.status === "done"}>
                {busyId === item.id ? <Loader2 size={16} className="animate-spin" /> : item.status === "done" ? <Check size={16} /> : null}
              </button>
              <span>{item.title}</span>
              {canEdit && <button type="button" disabled={busyId === item.id} onClick={() => void removeItem(item)} aria-label={`Delete ${item.title}`} title="Delete"><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      ) : <p className="bucket-year-empty">No items for {year} yet.</p>}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { DrawingNotebook } from "@/components/drawing-notebook";
import { cn } from "@/lib/cn";

type CollectionEntry = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  year: number;
  month: number;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2024, index, 1)));

export function CollectionBoard({ storageScope }: { storageScope: string }) {
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [title, setTitle] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const storageKey = `kiroku-bucket-v2:${encodeURIComponent(storageScope)}`;

  useEffect(() => {
    setLoadedKey(null);
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      const normalized = Array.isArray(parsed) ? parsed.flatMap((value): CollectionEntry[] => {
        if (!value || typeof value !== "object") return [];
        const entry = value as Partial<CollectionEntry>;
        if (typeof entry.id !== "string" || typeof entry.title !== "string") return [];
        const createdAt = Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now();
        return [{
          id: entry.id,
          title: entry.title,
          done: entry.done === true,
          createdAt,
          year: Number.isInteger(entry.year) ? Number(entry.year) : new Date(createdAt).getFullYear(),
          month: Number.isInteger(entry.month) && Number(entry.month) >= 1 && Number(entry.month) <= 12 ? Number(entry.month) : new Date(createdAt).getMonth() + 1,
        }];
      }) : [];
      // Import the earlier year-only bucket list once, keeping its entries intact.
      if (!stored) {
        const legacy = window.localStorage.getItem(`planit-bucket-v1:${encodeURIComponent(storageScope)}`);
        const oldEntries: unknown = legacy ? JSON.parse(legacy) : [];
        if (Array.isArray(oldEntries)) {
          normalized.push(...oldEntries.flatMap((value): CollectionEntry[] => {
            if (!value || typeof value !== "object") return [];
            const entry = value as Partial<CollectionEntry>;
            if (typeof entry.id !== "string" || typeof entry.title !== "string") return [];
            const createdAt = Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now();
            return [{ id: entry.id, title: entry.title, done: entry.done === true, createdAt, year: Number.isInteger(entry.year) ? Number(entry.year) : new Date(createdAt).getFullYear(), month: new Date(createdAt).getMonth() + 1 }];
          }));
        }
      }
      setEntries(normalized);
    } catch {
      setEntries([]);
    }
    setLoadedKey(storageKey);
  }, [storageKey, storageScope]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [entries, loadedKey, storageKey]);

  const years = useMemo(() => [...new Set([
    new Date().getFullYear(),
    ...entries.map((entry) => entry.year),
    ...Array.from({ length: 10 }, (_, index) => new Date().getFullYear() + index + 1),
  ])].sort((left, right) => right - left), [entries]);
  const visibleEntries = entries.filter((entry) => entry.year === year && entry.month === month);
  const selectedEntry = visibleEntries.find((entry) => entry.id === selectedEntryId) ?? null;

  function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const entry: CollectionEntry = { id: crypto.randomUUID(), title: cleanTitle, done: false, createdAt: Date.now(), year, month };
    setEntries((current) => [entry, ...current]);
    setTitle("");
  }

  return (
    <section className="planit-section collection-board-section" role="tabpanel" aria-label="Bucket list">
      {!selectedEntry && <div className="section-title-row">
        <div><h2>Bucket list</h2><p>Collect experiences you want to have.</p></div>
        <div className="collection-period-picker">
            <label className="bucket-year-picker"><span>Year</span><select aria-label="Bucket list year" value={year} onChange={(event) => { setYear(Number(event.target.value)); setSelectedEntryId(null); }}>{years.map((itemYear) => <option key={itemYear} value={itemYear}>{itemYear}</option>)}</select></label>
            <label className="bucket-year-picker"><span>Month</span><select aria-label="Bucket list month" value={month} onChange={(event) => { setMonth(Number(event.target.value)); setSelectedEntryId(null); }}>{MONTHS.map((itemMonth, index) => <option key={itemMonth} value={index + 1}>{itemMonth}</option>)}</select></label>
        </div>
      </div>}

      {selectedEntry ? (
        <>
          <div className="collection-board-open-heading">
            <button type="button" className="planit-secondary-button" onClick={() => setSelectedEntryId(null)}><ArrowLeft size={16} /> Back to Bucket list</button>
            <span>{MONTHS[selectedEntry.month - 1]} {selectedEntry.year}</span>
          </div>
          <div className="collection-board-open-title"><h3>{selectedEntry.title}</h3></div>
          <DrawingNotebook storageScope={storageScope} bookId={`bucket-${selectedEntry.id}`} title={selectedEntry.title} compactControls />
        </>
      ) : <>
      <form className="bucket-add-form bucket-simple-form collection-entry-form" onSubmit={addEntry}>
        <label className="sr-only" htmlFor="bucket-entry-title">Bucket list item</label>
        <input id="bucket-entry-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Add something for ${MONTHS[month - 1]} ${year}…`} maxLength={180} required />
        <button type="submit" className="planit-primary-button" disabled={!title.trim()}><Plus size={17} /> Add</button>
      </form>
      {storageError && <p className="gallery-error" role="status">The bucket list could not be saved in this browser.</p>}
      <div className="collection-board-layout">
        <div className="collection-list-panel">
          <h3>{MONTHS[month - 1]} {year}</h3>
          {visibleEntries.length ? (
            <ul className="bucket-list bucket-simple-list">
              {visibleEntries.map((entry) => (
                <li key={entry.id} className={cn("bucket-item", entry.done && "is-done")}>
                  <button type="button" className="planner-task-check" onClick={() => setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, done: !item.done } : item))} aria-label={entry.done ? `Reopen ${entry.title}` : `Mark ${entry.title} done`} aria-pressed={entry.done}>{entry.done && <Check size={13} />}</button>
                  <button type="button" className="bucket-item-title collection-entry-open" onClick={() => setSelectedEntryId(entry.id)}>{entry.title}</button>
                  <button type="button" className="collection-open-board-button" onClick={() => setSelectedEntryId(entry.id)} aria-label={`Open board for ${entry.title}`} title="Open board"><LayoutDashboard size={16} /></button>
                  <button type="button" className="planner-task-delete" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))} aria-label={`Delete ${entry.title}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="planit-empty">Nothing added for {MONTHS[month - 1]} yet.</p>}
        </div>
      </div>
      </>}
    </section>
  );
}

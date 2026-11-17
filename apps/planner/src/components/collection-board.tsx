"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Plus, Trash2 } from "lucide-react";
import { DrawingNotebook } from "@/components/drawing-notebook";
import { cn } from "@/lib/cn";

type CollectionEntry = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  year: number;
  month: number;
  url?: string;
};

const MONTHS = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2024, index, 1)));

export function CollectionBoard({ kind, storageScope }: { kind: "bucket" | "wishlist"; storageScope: string }) {
  const isWishlist = kind === "wishlist";
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [entryError, setEntryError] = useState("");
  const storageKey = `kiroku-${kind}-v2:${encodeURIComponent(storageScope)}`;

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
          ...(isWishlist && typeof entry.url === "string" ? { url: entry.url } : {}),
        }];
      }) : [];
      // Import the earlier year-only bucket list once, keeping its entries intact.
      if (kind === "bucket" && !stored) {
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
  }, [isWishlist, kind, storageKey, storageScope]);

  useEffect(() => {
    if (loadedKey === storageKey) window.localStorage.setItem(storageKey, JSON.stringify(entries));
  }, [entries, loadedKey, storageKey]);

  const years = useMemo(() => [...new Set([
    new Date().getFullYear(),
    ...entries.map((entry) => entry.year),
    ...Array.from({ length: 10 }, (_, index) => new Date().getFullYear() + index + 1),
  ])].sort((left, right) => right - left), [entries]);
  const visibleEntries = entries.filter((entry) => entry.year === year && entry.month === month);

  function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    let productUrl = url.trim();
    if (isWishlist && productUrl) {
      try {
        const parsedUrl = new URL(productUrl);
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error();
        productUrl = parsedUrl.toString();
      } catch {
        setEntryError("Enter a valid product link starting with http:// or https://.");
        return;
      }
    }
    const entry: CollectionEntry = { id: crypto.randomUUID(), title: cleanTitle, done: false, createdAt: Date.now(), year, month };
    if (isWishlist) entry.url = productUrl;
    setEntries((current) => [entry, ...current]);
    setTitle("");
    setUrl("");
    setEntryError("");
  }

  return (
    <section className="planit-section collection-board-section" role="tabpanel" aria-label={isWishlist ? "Wishlist" : "Bucket list"}>
      <div className="section-title-row">
        <div><h2>{isWishlist ? "Wishlist" : "Bucket list"}</h2><p>{isWishlist ? "Save things you would like to buy." : "Collect experiences you want to have."}</p></div>
        <div className="collection-period-picker">
          <label className="bucket-year-picker"><span>Year</span><select aria-label={`${isWishlist ? "Wishlist" : "Bucket list"} year`} value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((itemYear) => <option key={itemYear} value={itemYear}>{itemYear}</option>)}</select></label>
          <label className="bucket-year-picker"><span>Month</span><select aria-label={`${isWishlist ? "Wishlist" : "Bucket list"} month`} value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTHS.map((itemMonth, index) => <option key={itemMonth} value={index + 1}>{itemMonth}</option>)}</select></label>
        </div>
      </div>

      <form className={cn("bucket-add-form", "bucket-simple-form", "collection-entry-form", isWishlist && "is-wishlist")} onSubmit={addEntry}>
        <label className="sr-only" htmlFor={`${kind}-entry-title`}>{isWishlist ? "Product name" : "Bucket list item"}</label>
        <input id={`${kind}-entry-title`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isWishlist ? "Product or idea name…" : `Add something for ${MONTHS[month - 1]} ${year}…`} maxLength={180} required />
        {isWishlist && <>
          <label className="sr-only" htmlFor="wishlist-entry-url">Product link</label>
          <input id="wishlist-entry-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste product link (optional)" maxLength={2048} />
        </>}
        <button type="submit" className="planit-primary-button" disabled={!title.trim()}><Plus size={17} /> Add</button>
      </form>
      {entryError && <p className="gallery-error" role="alert">{entryError}</p>}

      <div className="collection-board-layout">
        <div className="collection-list-panel">
          <h3>{MONTHS[month - 1]} {year}</h3>
          {visibleEntries.length ? (
            <ul className="bucket-list bucket-simple-list">
              {visibleEntries.map((entry) => (
                <li key={entry.id} className={cn("bucket-item", entry.done && "is-done")}>
                  <button type="button" className="planner-task-check" onClick={() => setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, done: !item.done } : item))} aria-label={entry.done ? `Reopen ${entry.title}` : `Mark ${entry.title} done`} aria-pressed={entry.done}>{entry.done && <Check size={13} />}</button>
                  <span className="bucket-item-title">{entry.title}</span>
                  {entry.url?.startsWith("http://") || entry.url?.startsWith("https://") ? <a className="collection-entry-link" href={entry.url} target="_blank" rel="noreferrer" aria-label={`Open link for ${entry.title}`} title="Open product link"><ExternalLink size={15} /></a> : null}
                  <button type="button" className="planner-task-delete" onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))} aria-label={`Delete ${entry.title}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="planit-empty">Nothing added for {MONTHS[month - 1]} yet.</p>}
        </div>
        <div className="collection-drawing-board">
          <DrawingNotebook storageScope={storageScope} bookId={`${kind}-${year}-${String(month).padStart(2, "0")}`} title={`${isWishlist ? "Wishlist" : "Bucket list"} ${year}-${month}`} compactControls />
        </div>
      </div>
    </section>
  );
}

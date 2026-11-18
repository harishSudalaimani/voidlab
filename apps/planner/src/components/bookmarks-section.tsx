"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, ExternalLink, Plus, Search, Star, Trash2 } from "lucide-react";

type BookmarkCategory = "Reading" | "Watch" | "Listen" | "Inspiration" | "Other";
type SavedBookmark = { id: string; title: string; url: string; note: string; category: BookmarkCategory; favorite: boolean; createdAt: number };
const CATEGORIES: BookmarkCategory[] = ["Reading", "Watch", "Listen", "Inspiration", "Other"];

function normalizeBookmarks(value: unknown): SavedBookmark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): SavedBookmark[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<SavedBookmark>;
    if (typeof item.id !== "string" || typeof item.url !== "string" || typeof item.title !== "string") return [];
    try {
      const url = new URL(item.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      return [{
        id: item.id,
        title: item.title.slice(0, 180),
        url: url.href,
        note: typeof item.note === "string" ? item.note.slice(0, 500) : "",
        category: CATEGORIES.includes(item.category as BookmarkCategory) ? item.category as BookmarkCategory : "Other",
        favorite: item.favorite === true,
        createdAt: Number.isFinite(item.createdAt) ? Number(item.createdAt) : Date.now(),
      }];
    } catch { return []; }
  });
}

export function BookmarksSection({ storageScope }: { storageScope: string }) {
  const storageKey = `kiroku-bookmarks-v1:${encodeURIComponent(storageScope)}`;
  const [items, setItems] = useState<SavedBookmark[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<BookmarkCategory>("Reading");
  const [filter, setFilter] = useState<BookmarkCategory | "All">("All");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setLoadedKey(null);
    try {
      const value = window.localStorage.getItem(storageKey);
      setItems(normalizeBookmarks(value ? JSON.parse(value) as unknown : []));
    } catch {
      setItems([]);
    }
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [items, loadedKey, storageKey]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => (filter === "All" || item.category === filter)
        && (!query || `${item.title} ${item.url} ${item.note}`.toLowerCase().includes(query)))
      .sort((left, right) => Number(right.favorite) - Number(left.favorite) || right.createdAt - left.createdAt);
  }, [filter, items, search]);

  function addBookmark(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error();
    } catch {
      setError("Enter a valid link starting with http:// or https://.");
      return;
    }
    if (items.some((item) => item.url === parsedUrl.href)) {
      setError("That link is already saved.");
      return;
    }
    const cleanTitle = title.trim() || parsedUrl.hostname.replace(/^www\./, "");
    setItems((current) => [{ id: crypto.randomUUID(), title: cleanTitle, url: parsedUrl.href, note: note.trim(), category, favorite: false, createdAt: Date.now() }, ...current]);
    setTitle(""); setUrl(""); setNote(""); setError("");
  }

  return (
    <section className="bookmarks-section" role="tabpanel" aria-label="Bookmarks">
      <header className="bookmarks-heading">
        <div><p className="bookmarks-eyebrow">Keep useful links close</p><h2>Bookmarks</h2><p>Save articles, videos, music, and inspiration for later.</p></div>
        <span className="bookmarks-count"><Bookmark size={16} />{items.length} saved</span>
      </header>

      <form className="bookmarks-form" onSubmit={addBookmark}>
        <div className="bookmarks-form-row">
          <label><span>Link</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" maxLength={2048} required /></label>
          <label><span>Name <small>optional</small></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give it a name" maxLength={180} /></label>
          <label><span>Type</span><select value={category} onChange={(event) => setCategory(event.target.value as BookmarkCategory)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="bookmarks-form-bottom"><label><span>Note <small>optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What do you want to remember?" maxLength={500} /></label><button type="submit" className="planit-primary-button"><Plus size={16} /> Save bookmark</button></div>
      </form>

      {error && <p className="bookmarks-message is-error" role="alert">{error}</p>}
      {storageError && <p className="bookmarks-message is-error" role="status">Bookmarks could not be saved in this browser.</p>}

      <div className="bookmarks-tools">
        <div className="bookmarks-filters" role="group" aria-label="Filter bookmarks">
          {(["All", ...CATEGORIES] as const).map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}
        </div>
        <label className="bookmarks-search"><Search size={16} /><span className="sr-only">Search bookmarks</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved links" /></label>
      </div>

      {visibleItems.length ? <div className="bookmarks-grid">{visibleItems.map((item) => {
        const hostname = (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })();
        return <article className="bookmark-card" key={item.id}>
          <div className="bookmark-card-top"><span className="bookmark-category">{item.category}</span><div><button type="button" className={item.favorite ? "is-favorite" : ""} onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, favorite: !entry.favorite } : entry))} aria-label={item.favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`} aria-pressed={item.favorite}><Star size={16} fill={item.favorite ? "currentColor" : "none"} /></button><button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.title}`}><Trash2 size={16} /></button></div></div>
          <h3>{item.title}</h3><span className="bookmark-hostname">{hostname}</span>{item.note && <p>{item.note}</p>}
          <a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open link</a>
        </article>;
      })}</div> : <div className="bookmarks-empty"><span><Bookmark size={24} /></span><strong>{items.length ? "No matching bookmarks" : "No bookmarks yet"}</strong><small>{items.length ? "Try another search or category." : "Add a link above to build your saved collection."}</small></div>}
    </section>
  );
}

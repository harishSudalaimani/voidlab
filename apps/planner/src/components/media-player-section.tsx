"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Disc3, ListMusic, Music2, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Upload, Video } from "lucide-react";
import { cn } from "@/lib/cn";

type MediaType = "image" | "video" | "audio";
type MediaEntry = { id: string; scope: string; name: string; type: MediaType; mimeType: string; createdAt: number; blob: Blob; folderId?: string };
type Filter = "all" | "audio" | "video";
let mediaDatabase: Promise<IDBDatabase> | null = null;

function openMediaDatabase() {
  if (mediaDatabase) return mediaDatabase;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open("kiroku-gallery", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("media")) request.result.createObjectStore("media", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("folders")) request.result.createObjectStore("folders", { keyPath: "id" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); mediaDatabase = null; }; resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
  mediaDatabase = opening.catch((error) => { mediaDatabase = null; throw error; });
  return mediaDatabase;
}

async function readLocalMedia(scope: string) {
  const database = await openMediaDatabase();
  return new Promise<MediaEntry[]>((resolve, reject) => {
    const request = database.transaction("media", "readonly").objectStore("media").getAll();
    request.onsuccess = () => resolve((request.result as MediaEntry[]).filter((item) => item.scope === scope && (item.type === "audio" || item.type === "video")).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalMedia(item: MediaEntry) {
  const database = await openMediaDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("media", "readwrite"); transaction.objectStore("media").put(item);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteLocalMedia(id: string) {
  const database = await openMediaDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("media", "readwrite"); transaction.objectStore("media").delete(id);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}

export function MediaPlayerSection({ storageScope }: { storageScope: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLMediaElement>(null);
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaUrlId, setMediaUrlId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setItems([]); setSelectedId(null); setPlaying(false); setError("");
    readLocalMedia(storageScope).then((next) => { if (!cancelled) setItems(next); }).catch(() => { if (!cancelled) setError("The local media library could not be opened in this browser."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storageScope]);

  const visibleItems = useMemo(() => items.filter((item) => (filter === "all" || item.type === filter) && item.name.toLowerCase().includes(search.trim().toLowerCase())), [items, filter, search]);
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedItem) { setMediaUrl(""); setMediaUrlId(null); return; }
    const url = URL.createObjectURL(selectedItem.blob); setMediaUrl(url); setMediaUrlId(selectedItem.id);
    return () => URL.revokeObjectURL(url);
  }, [selectedItem?.id, selectedItem?.blob]);

  useEffect(() => {
    if (!playing || !selectedId || mediaUrlId !== selectedId) return;
    void playerRef.current?.play().catch(() => { setPlaying(false); setError("Playback was blocked. Press play on the media controls to start it."); });
  }, [playing, selectedId, mediaUrlId]);

  function selectItem(item: MediaEntry, start = true) { setSelectedId(item.id); setPlaying(start); }
  function togglePlayback() {
    const element = playerRef.current;
    if (!element) return;
    if (element.paused) void element.play().then(() => setPlaying(true)).catch(() => { setPlaying(false); setError("This file could not be played in the browser."); });
    else element.pause();
  }
  function moveTrack(direction: -1 | 1) {
    if (!visibleItems.length) return;
    const current = visibleItems.findIndex((item) => item.id === selectedId);
    const nextIndex = current < 0 ? 0 : (current + direction + visibleItems.length) % visibleItems.length;
    if (visibleItems[nextIndex]?.id === selectedId) {
      const element = playerRef.current;
      if (element) { element.currentTime = 0; void element.play().then(() => setPlaying(true)).catch(() => setError("This file could not be played in the browser.")); }
      return;
    }
    selectItem(visibleItems[nextIndex]);
  }
  async function importMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = "";
    if (!files.length) return;
    setImporting(true); setError(""); const additions: MediaEntry[] = []; let fileError = "";
    try {
      for (const file of files) {
        const type: MediaType | null = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : null;
        if (!type) { fileError = `${file.name} is not an audio or video file.`; continue; }
        const item: MediaEntry = { id: `${encodeURIComponent(storageScope)}:${crypto.randomUUID()}`, scope: storageScope, name: file.name, type, mimeType: file.type || (type === "audio" ? "audio/mpeg" : "video/mp4"), createdAt: Date.now(), blob: file };
        await saveLocalMedia(item); additions.push(item);
      }
      if (additions.length) setItems((current) => [...additions.reverse(), ...current]);
      if (fileError) setError(fileError);
    } catch { setError("The browser could not save this media. Check available storage and try a smaller file."); }
    finally { setImporting(false); }
  }
  async function removeItem(item: MediaEntry) {
    try { await deleteLocalMedia(item.id); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); if (selectedId === item.id) { setSelectedId(null); setPlaying(false); } setError(""); }
    catch { setError(`Could not remove ${item.name} from your local library.`); }
  }
  function handleEnded() { if (visibleItems.length > 1) moveTrack(1); else setPlaying(false); }

  return (
    <section className="media-player-section" aria-label="Local media player">
      <header className="media-player-heading">
        <div><p className="media-player-eyebrow">Your device library</p><h2>Media player</h2><p>Play audio and video saved in this app’s local media library.</p></div>
        <div><input ref={fileInputRef} className="sr-only" type="file" accept="audio/*,video/*" multiple onChange={(event) => void importMedia(event)} aria-label="Add audio and video files" /><button type="button" className="planit-primary-button" onClick={() => fileInputRef.current?.click()} disabled={importing || loading}><Upload size={16} />{importing ? "Adding…" : "Add media"}</button></div>
      </header>
      <p className="media-player-local-note"><Disc3 size={15} /> Scans media already saved in this app on this browser. Choose files to add more; browsers don’t allow automatic access to other device folders.</p>

      <div className="media-player-layout">
        <main className="media-player-now-card">
          {selectedItem && mediaUrl && mediaUrlId === selectedItem.id ? <>
            <div className={cn("media-player-art", selectedItem.type === "video" && "is-video")}>{selectedItem.type === "video" ? <video ref={(element) => { playerRef.current = element; }} key={selectedItem.id} src={mediaUrl} controls autoPlay={playing} playsInline onPlay={() => { if (selectedId === selectedItem.id) setPlaying(true); }} onPause={() => { if (selectedId === selectedItem.id) setPlaying(false); }} onEnded={handleEnded} aria-label={selectedItem.name} /> : <div className="media-player-audio-art"><span><AudioLines size={42} /></span><small>NOW PLAYING</small><strong title={selectedItem.name}>{selectedItem.name}</strong><audio ref={(element) => { playerRef.current = element; }} key={selectedItem.id} src={mediaUrl} controls autoPlay={playing} onPlay={() => { if (selectedId === selectedItem.id) setPlaying(true); }} onPause={() => { if (selectedId === selectedItem.id) setPlaying(false); }} onEnded={handleEnded} aria-label={selectedItem.name} /></div>}</div>
            <div className="media-player-track-meta"><span className="media-player-kind">{selectedItem.type === "audio" ? <Music2 size={14} /> : <Video size={14} />}{selectedItem.type}</span><h3 title={selectedItem.name}>{selectedItem.name}</h3><small>Added {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(selectedItem.createdAt)}</small></div>
            <div className="media-player-controls"><button type="button" onClick={() => moveTrack(-1)} aria-label="Previous track"><SkipBack size={18} fill="currentColor" /></button><button type="button" className="media-player-toggle" onClick={togglePlayback} aria-label={playing ? "Pause media" : "Play media"}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button type="button" onClick={() => moveTrack(1)} aria-label="Next track"><SkipForward size={18} fill="currentColor" /></button></div>
          </> : <div className="media-player-empty-state"><span><ListMusic size={30} /></span><h3>{loading ? "Scanning your library…" : "Pick something to play"}</h3><p>{loading ? "Looking for audio and video saved in this browser." : "Choose a file from the playlist or add audio and video from your device."}</p><button type="button" className="planit-secondary-button" onClick={() => fileInputRef.current?.click()} disabled={loading || importing}><Plus size={15} /> Add audio or video</button></div>}
        </main>

        <aside className="media-player-library-card">
          <div className="media-player-library-heading"><div><span>LOCAL LIBRARY</span><h3>Playlist <small>{items.length}</small></h3></div><span className="media-player-library-icon"><ListMusic size={18} /></span></div>
          <div className="media-player-library-tools"><div className="media-player-filter" role="group" aria-label="Filter media">{(["all", "audio", "video"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? "is-active" : ""} aria-pressed={filter === item}>{item === "all" ? "All" : item === "audio" ? "Audio" : "Video"}</button>)}</div><label className="sr-only" htmlFor="media-player-search">Search media</label><input id="media-player-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file…" /></div>
          {error && <p className="media-player-error" role="status">{error}</p>}
          <div className="media-player-playlist" aria-label="Available media">{visibleItems.length ? visibleItems.map((item, index) => <div key={item.id} className={cn("media-player-row", item.id === selectedId && "is-active")}><button type="button" className="media-player-row-play" onClick={() => item.id === selectedId ? togglePlayback() : selectItem(item)} aria-label={`${item.id === selectedId && playing ? "Pause" : "Play"} ${item.name}`}>{item.id === selectedId && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button type="button" className="media-player-row-info" onClick={() => { if (item.id !== selectedId) selectItem(item); }}><span className="media-player-row-icon">{item.type === "audio" ? <Music2 size={15} /> : <Video size={15} />}</span><span><strong title={item.name}>{item.name}</strong><small>{item.type} · {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(item.createdAt)}</small></span></button><button type="button" className="media-player-row-delete" onClick={() => void removeItem(item)} aria-label={`Remove ${item.name}`} title="Remove from library"><Trash2 size={14} /></button><span className="sr-only">Track {index + 1}</span></div>) : <div className="media-player-list-empty">{loading ? "Scanning local media…" : search ? "No matches. Try another search." : filter === "all" ? "No saved audio or video yet." : `No ${filter} files found.`}</div>}</div>
          <footer className="media-player-library-footer">Media is stored in this browser’s app library and stays on this device.</footer>
        </aside>
      </div>
    </section>
  );
}

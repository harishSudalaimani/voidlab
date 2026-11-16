"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Lightbulb,
  Maximize2,
  Minimize2,
  Moon,
  NotebookPen,
  PenLine,
  Plus,
  Search,
  Shuffle,
  Sun,
  Trash2,
  X,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { DrawingNotebook } from "@/components/drawing-notebook";
import { FinanceDashboard } from "@/components/finance-dashboard";
import { PortfolioEditor } from "@/components/portfolio-editor";

type DayTask = { id: string; title: string; done: boolean };
type Theme = "dark" | "light";
type Section = "planner" | "study" | "bucket" | "finance" | "portfolio";
type StudyView = "note" | "notebook";
type BucketView = "list" | "notebook";
type StudyNote = { id: string; title: string; subject: string; body: string; updatedAt: number };
type BucketItem = {
  id: string;
  title: string;
  category: "Places" | "Skills" | "Experiences" | "Other";
  done: boolean;
  createdAt: number;
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const START_DATE = "2026-12-01";
const BUCKET_CATEGORIES: BucketItem["category"][] = ["Places", "Skills", "Experiences", "Other"];

function dateKey(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}

function startOfWeek(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function readArray<T>(key: string, legacyKey?: string): T[] {
  const stored = window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
  if (!stored) return [];
  try {
    const value = JSON.parse(stored) as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

export function TodayPlanner({
  initialDateKey = START_DATE,
  storageScope,
}: {
  initialDateKey?: string;
  storageScope: string;
}) {
  const [section, setSection] = useState<Section>("planner");
  const [selectedDate, setSelectedDate] = useState(() => dateFromKey(initialDateKey));
  const selectedKey = dateKey(selectedDate);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [loadedTaskKey, setLoadedTaskKey] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [loadedNotesKey, setLoadedNotesKey] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [studyView, setStudyView] = useState<StudyView>("note");
  const [studyFullscreen, setStudyFullscreen] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");
  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [loadedBucketKey, setLoadedBucketKey] = useState<string | null>(null);
  const [bucketView, setBucketView] = useState<BucketView>("list");
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [bucketSearch, setBucketSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("All");
  const [newBucketTitle, setNewBucketTitle] = useState("");
  const [newBucketCategory, setNewBucketCategory] = useState<BucketItem["category"]>("Experiences");
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const taskStorageKey = `planit-day-v1:${encodeURIComponent(storageScope)}:${selectedKey}`;
  const notesStorageKey = `planit-study-notes-v1:${encodeURIComponent(storageScope)}`;
  const bucketStorageKey = `planit-bucket-v1:${encodeURIComponent(storageScope)}`;
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
  const selectedBucketItem = bucketItems.find((item) => item.id === selectedBucketId) ?? null;
  const fullDate = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(selectedDate);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("planit-theme") ?? window.localStorage.getItem("northstar-theme");
    const nextTheme: Theme = savedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallHelpOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    setTasks(readArray<DayTask>(taskStorageKey, `northstar-day-v2:${encodeURIComponent(storageScope)}:${selectedKey}`));
    setLoadedTaskKey(taskStorageKey);
  }, [taskStorageKey]);

  useEffect(() => {
    if (loadedTaskKey === taskStorageKey) window.localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
  }, [loadedTaskKey, taskStorageKey, tasks]);

  useEffect(() => {
    setNotes(readArray<StudyNote>(notesStorageKey));
    setLoadedNotesKey(notesStorageKey);
  }, [notesStorageKey]);

  useEffect(() => {
    if (loadedNotesKey === notesStorageKey) window.localStorage.setItem(notesStorageKey, JSON.stringify(notes));
  }, [loadedNotesKey, notesStorageKey, notes]);

  useEffect(() => {
    setBucketItems(readArray<BucketItem>(bucketStorageKey));
    setLoadedBucketKey(bucketStorageKey);
  }, [bucketStorageKey]);

  useEffect(() => {
    if (loadedBucketKey === bucketStorageKey) window.localStorage.setItem(bucketStorageKey, JSON.stringify(bucketItems));
  }, [bucketItems, bucketStorageKey, loadedBucketKey]);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const filteredNotes = useMemo(() => {
    const query = noteSearch.trim().toLowerCase();
    return [...notes]
      .filter((note) => !query || `${note.title} ${note.subject} ${note.body}`.toLowerCase().includes(query))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [noteSearch, notes]);

  const filteredBucketItems = useMemo(() => {
    const query = bucketSearch.trim().toLowerCase();
    return bucketItems.filter((item) =>
      (bucketFilter === "All" || item.category === bucketFilter)
      && (!query || item.title.toLowerCase().includes(query)),
    );
  }, [bucketFilter, bucketItems, bucketSearch]);

  function selectDate(key: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const next = dateFromKey(key);
    if (dateKey(next) === key) setSelectedDate(next);
  }

  function shiftDate(amount: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setSelectedDate(next);
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("planit-theme", nextTheme);
  }

  async function installKiroku() {
    if (!installPrompt) {
      setInstallHelpOpen((open) => !open);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstallHelpOpen(false);
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    setTasks((current) => [...current, { id: crypto.randomUUID(), title, done: false }]);
    setNewTask("");
  }

  function createNote() {
    const note: StudyNote = { id: crypto.randomUUID(), title: "", subject: "", body: "", updatedAt: Date.now() };
    setNotes((current) => [note, ...current]);
    setSelectedNoteId(note.id);
    setStudyView("note");
  }

  function updateSelectedNote(patch: Partial<Pick<StudyNote, "title" | "subject" | "body">>) {
    if (!selectedNoteId) return;
    setNotes((current) => current.map((note) => note.id === selectedNoteId ? { ...note, ...patch, updatedAt: Date.now() } : note));
  }

  function deleteNote(id: string) {
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    if (selectedNoteId === id) {
      setSelectedNoteId(next[0]?.id ?? null);
      setStudyView("note");
    }
  }

  function addBucketItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newBucketTitle.trim();
    if (!title) return;
    setBucketItems((current) => [{ id: crypto.randomUUID(), title, category: newBucketCategory, done: false, createdAt: Date.now() }, ...current]);
    setNewBucketTitle("");
  }

  function surpriseMe() {
    const available = bucketItems.filter((item) => !item.done);
    if (available.length) setSpotlightId(available[Math.floor(Math.random() * available.length)].id);
  }

  const visibleTasks = loadedTaskKey === taskStorageKey ? tasks : [];

  return (
    <div className="planit-app">
      <header className="planit-header">
        <div>
          <p className="planner-eyebrow">KIROKU</p>
          <h1>Make room for what matters.</h1>
          <p className="planner-date-range">Your days, study notes, and someday list in one place.</p>
        </div>
        <div className="planit-header-actions">
          {!isInstalled && (
            <div className="planit-install-wrap">
              <button type="button" className="planit-install-button" onClick={installKiroku}><Download size={16} /><span>Install app</span></button>
              {installHelpOpen && (
                <div className="planit-install-help" role="status">
                  <button type="button" onClick={() => setInstallHelpOpen(false)} aria-label="Close install instructions"><X size={15} /></button>
                  <strong>Add Kiroku to your device</strong>
                  <p>Android: in Chrome, tap the menu and choose “Install app” or “Add to Home screen.” iPhone or iPad: in Safari, tap Share, then “Add to Home Screen.” Desktop: use the install icon in Chrome or Edge, or choose “Install app” from the browser menu.</p>
                </div>
              )}
            </div>
          )}
          <button type="button" className="planner-theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "white" : "dark"} theme`}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span>{theme === "dark" ? "White theme" : "Dark theme"}</span>
          </button>
        </div>
      </header>

      <nav className="planit-tabs" role="tablist" aria-label="Kiroku sections">
        <button type="button" role="tab" aria-selected={section === "planner"} className={cn("planit-tab", section === "planner" && "is-active")} onClick={() => setSection("planner")}>
          <CalendarDays size={17} /> Planner
        </button>
        <button type="button" role="tab" aria-selected={section === "study"} className={cn("planit-tab", section === "study" && "is-active")} onClick={() => setSection("study")}>
          <BookOpen size={17} /> Study notes
        </button>
        <button type="button" role="tab" aria-selected={section === "bucket"} className={cn("planit-tab", section === "bucket" && "is-active")} onClick={() => setSection("bucket")}>
          <Lightbulb size={17} /> Bucket list
        </button>
        <button type="button" role="tab" aria-selected={section === "finance"} className={cn("planit-tab", section === "finance" && "is-active")} onClick={() => setSection("finance")}>
          <Wallet size={17} /> Finance
        </button>
        <button type="button" role="tab" aria-selected={section === "portfolio"} className={cn("planit-tab", section === "portfolio" && "is-active")} onClick={() => setSection("portfolio")}>
          <PenLine size={17} /> Portfolio editor
        </button>
      </nav>

      {section === "planner" && (
        <div className="planner-screen" role="tabpanel">
          <section className="planner-calendar" aria-label="Choose a planner date">
            <div className="planner-date-controls">
              <button type="button" className="planner-icon-button" onClick={() => shiftDate(-1)} aria-label="Previous day">
                <ChevronLeft size={19} />
              </button>
              <label className="planner-selected-date">
                <CalendarDays size={17} />
                <span>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(selectedDate)}</span>
                <input aria-label="Jump to any date" type="date" value={selectedKey} onChange={(event) => selectDate(event.target.value)} />
              </label>
              <button type="button" className="planner-icon-button" onClick={() => shiftDate(1)} aria-label="Next day">
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="planner-week-strip">
              {weekDays.map((date) => {
                const key = dateKey(date);
                return (
                  <button key={key} type="button" onClick={() => selectDate(key)} aria-pressed={key === selectedKey} className={cn("planner-day-button", key === selectedKey && "is-selected")}>
                    <span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span>
                    <strong>{date.getDate()}</strong>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="planner-workspace">
            <DrawingNotebook storageScope={storageScope} bookId={`planner-${selectedKey}`} title="Daily notebook" legacyDateKey={selectedKey} />

            <section className="planner-tasks-card" aria-label="Tasks for this date">
              <div className="planner-card-heading">
                <div><h2>Tasks</h2><p>{fullDate}</p></div>
              </div>
              <form className="planner-task-form" onSubmit={addTask}>
                <label className="sr-only" htmlFor="planner-new-task">Add a task</label>
                <input id="planner-new-task" value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Write a task…" maxLength={180} />
                <button type="submit" disabled={!newTask.trim()} aria-label="Add task"><Plus size={18} /></button>
              </form>
              {visibleTasks.length ? (
                <ul className="planner-task-list">
                  {visibleTasks.map((task) => (
                    <li key={task.id} className={cn("planner-task", task.done && "is-done")}>
                      <button type="button" className="planner-task-check" onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`} aria-pressed={task.done}>{task.done && <Check size={13} />}</button>
                      <span>{task.title}</span>
                      <button type="button" className="planner-task-delete" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="planner-empty-tasks">Add anything you want to remember for this date.</p>}
              <p className="planner-local-note">Saved on this device</p>
            </section>
          </div>
        </div>
      )}

      {section === "study" && (
        <section className="planit-section" role="tabpanel" aria-label="Study notes">
          <div className="section-title-row">
            <div><h2>Study notes</h2><p>Keep class notes, ideas, and revisions together.</p></div>
            <button type="button" className="planit-primary-button" onClick={createNote}><Plus size={17} /> New note</button>
          </div>
          <div className="study-layout">
            <aside className="study-note-list">
              <label className="planit-search"><Search size={16} /><input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} placeholder="Search your notes" /></label>
              {filteredNotes.length ? filteredNotes.map((note) => (
                <button key={note.id} type="button" className={cn("study-note-item", note.id === selectedNoteId && "is-selected")} onClick={() => setSelectedNoteId(note.id)}>
                  <strong>{note.title || "Untitled note"}</strong>
                  <span>{note.subject || "No subject"} · {new Date(note.updatedAt).toLocaleDateString()}</span>
                  <small>{note.body || "Start writing…"}</small>
                </button>
              )) : <p className="planit-empty">No notes yet. Create one to start your study notebook.</p>}
            </aside>
            <div className={cn("study-editor", studyFullscreen && studyView === "note" && "is-fullscreen")}>
              {selectedNote ? (
                <>
                  <div className="study-editor-top">
                    <div className="study-view-switch" role="group" aria-label="Study note view">
                      <button type="button" className={cn(studyView === "note" && "is-active")} onClick={() => { setStudyView("note"); setStudyFullscreen(false); }}>Text note</button>
                      <button type="button" className={cn(studyView === "notebook" && "is-active")} onClick={() => { setStudyView("notebook"); setStudyFullscreen(false); }}><NotebookPen size={15} /> Board pages</button>
                    </div>
                    {studyView === "note" && <button type="button" className="study-fullscreen-button" onClick={() => setStudyFullscreen((value) => !value)} aria-label={studyFullscreen ? "Exit full screen note" : "View note full screen"}>{studyFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
                    <button type="button" className="planner-tool-button planner-action-button" onClick={() => deleteNote(selectedNote.id)} aria-label="Delete note"><Trash2 size={16} /></button>
                  </div>
                  {studyView === "note" ? (
                    <>
                      <input className="study-title-input" value={selectedNote.title} onChange={(event) => updateSelectedNote({ title: event.target.value })} placeholder="Note title" maxLength={120} />
                      <input className="study-subject-input" value={selectedNote.subject} onChange={(event) => updateSelectedNote({ subject: event.target.value })} placeholder="Subject or class" maxLength={60} />
                      <textarea className="study-body-input" value={selectedNote.body} onChange={(event) => updateSelectedNote({ body: event.target.value })} placeholder="Start writing your notes…" />
                    </>
                  ) : (
                    <DrawingNotebook storageScope={storageScope} bookId={`study-${selectedNote.id}`} title={`${selectedNote.title || "Study note"} notebook`} />
                  )}
                </>
              ) : (
                <div className="study-empty-editor"><BookOpen size={28} /><p>Select a note or create a new one.</p><button type="button" className="planit-primary-button" onClick={createNote}><Plus size={17} /> New note</button></div>
              )}
            </div>
          </div>
        </section>
      )}

      {section === "bucket" && (
        <section className="planit-section" role="tabpanel" aria-label="Bucket list">
          {bucketView === "notebook" && selectedBucketItem ? (
            <>
              <div className="section-title-row bucket-notebook-header">
                <div><h2>{selectedBucketItem.title}</h2><p>Idea notebook · add as many pages as you need.</p></div>
                <button type="button" className="planit-secondary-button" onClick={() => setBucketView("list")}><ChevronLeft size={16} /> Back to list</button>
              </div>
              <DrawingNotebook storageScope={storageScope} bookId={`bucket-${selectedBucketItem.id}`} title="Idea notebook" />
            </>
          ) : (
            <>
          <div className="section-title-row">
            <div><h2>Bucket list</h2><p>Save the places, skills, and experiences you want to make time for.</p></div>
            <button type="button" className="planit-secondary-button" onClick={surpriseMe}><Shuffle size={16} /> Surprise me</button>
          </div>
          <form className="bucket-add-form" onSubmit={addBucketItem}>
            <label className="sr-only" htmlFor="bucket-item-title">Add to your bucket list</label>
            <input id="bucket-item-title" value={newBucketTitle} onChange={(event) => setNewBucketTitle(event.target.value)} placeholder="What would you love to do someday?" maxLength={180} />
            <select aria-label="Bucket list category" value={newBucketCategory} onChange={(event) => setNewBucketCategory(event.target.value as BucketItem["category"])}>
              {BUCKET_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
            <button type="submit" className="planit-primary-button" disabled={!newBucketTitle.trim()}><Plus size={17} /> Add idea</button>
          </form>
          <div className="bucket-controls">
            <label className="planit-search"><Search size={16} /><input value={bucketSearch} onChange={(event) => setBucketSearch(event.target.value)} placeholder="Find an idea" /></label>
            <div className="bucket-filters" role="group" aria-label="Filter by category">
              {["All", ...BUCKET_CATEGORIES].map((category) => <button key={category} type="button" className={cn("bucket-filter", bucketFilter === category && "is-selected")} onClick={() => setBucketFilter(category)}>{category}</button>)}
            </div>
          </div>
          {spotlightId && bucketItems.find((item) => item.id === spotlightId) && (
            <div className="bucket-spotlight"><Lightbulb size={17} /><span>How about: <strong>{bucketItems.find((item) => item.id === spotlightId)?.title}</strong></span><button type="button" onClick={() => setSpotlightId(null)} aria-label="Dismiss suggestion"><X size={16} /></button></div>
          )}
          {filteredBucketItems.length ? (
            <ul className="bucket-list">
              {filteredBucketItems.map((item) => (
                <li key={item.id} className={cn("bucket-item", item.done && "is-done", spotlightId === item.id && "is-spotlight")}>
                  <button type="button" className="planner-task-check" onClick={() => setBucketItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))} aria-label={item.done ? `Reopen ${item.title}` : `Mark ${item.title} done`} aria-pressed={item.done}>{item.done && <Check size={13} />}</button>
                  <span className="bucket-item-title">{item.title}</span>
                  <span className="bucket-category-tag">{item.category}</span>
                  <button type="button" className="bucket-notebook-button" onClick={() => { setSelectedBucketId(item.id); setBucketView("notebook"); }} aria-label={`Open notebook for ${item.title}`} title="Open idea notebook"><NotebookPen size={16} /></button>
                  <button type="button" className="planner-task-delete" onClick={() => { setBucketItems((current) => current.filter((entry) => entry.id !== item.id)); if (selectedBucketId === item.id) { setSelectedBucketId(null); setBucketView("list"); } }} aria-label={`Delete ${item.title}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="planit-empty">Nothing here yet. Add an idea you want to remember.</p>}
          <p className="planner-local-note">Your list stays on this device.</p>
            </>
          )}
        </section>
      )}

      {section === "finance" && <FinanceDashboard storageScope={storageScope} />}
      {section === "portfolio" && <PortfolioEditor />}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Lightbulb,
  Moon,
  NotebookPen,
  Plus,
  Search,
  Shuffle,
  Sun,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type DayTask = { id: string; title: string; done: boolean };
type InkPoint = { x: number; y: number };
type InkStroke = { points: InkPoint[]; color: string; width: number };
type Theme = "dark" | "light";
type BoardKind = "white" | "black";
type Section = "planner" | "study" | "bucket";
type StudyNote = { id: string; title: string; subject: string; body: string; updatedAt: number };
type BucketItem = {
  id: string;
  title: string;
  category: "Places" | "Skills" | "Experiences" | "Other";
  done: boolean;
  createdAt: number;
};

const START_DATE = "2026-12-01";
const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 650;
const WHITE_INKS = ["#17191f", "#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c"];
const CHALK_INKS = ["#f8fafc", "#fde047", "#f9a8d4", "#67e8f9", "#86efac", "#fdba74"];
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

function strokePath(points: InkPoint[]) {
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  if (points.length === 1) return `${path} L${(points[0].x + 0.1).toFixed(1)},${points[0].y.toFixed(1)}`;
  return path;
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
  const [boardKind, setBoardKind] = useState<BoardKind>("white");
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [loadedBoardKey, setLoadedBoardKey] = useState<string | null>(null);
  const [activeStroke, setActiveStroke] = useState<InkStroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState(WHITE_INKS[0]);
  const [penSize, setPenSize] = useState(3.5);
  const [eraserSize, setEraserSize] = useState(30);
  const [theme, setTheme] = useState<Theme>("dark");

  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [loadedNotesKey, setLoadedNotesKey] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [bucketItems, setBucketItems] = useState<BucketItem[]>([]);
  const [loadedBucketKey, setLoadedBucketKey] = useState<string | null>(null);
  const [bucketSearch, setBucketSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("All");
  const [newBucketTitle, setNewBucketTitle] = useState("");
  const [newBucketCategory, setNewBucketCategory] = useState<BucketItem["category"]>("Experiences");
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  const activeStrokeRef = useRef<InkStroke | null>(null);
  const taskStorageKey = `planit-day-v1:${encodeURIComponent(storageScope)}:${selectedKey}`;
  const boardStorageKey = `planit-board-v2:${encodeURIComponent(storageScope)}:${selectedKey}:${boardKind}`;
  const notesStorageKey = `planit-study-notes-v1:${encodeURIComponent(storageScope)}`;
  const bucketStorageKey = `planit-bucket-v1:${encodeURIComponent(storageScope)}`;
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;
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
    setTasks(readArray<DayTask>(taskStorageKey, `northstar-day-v2:${encodeURIComponent(storageScope)}:${selectedKey}`));
    setLoadedTaskKey(taskStorageKey);
  }, [taskStorageKey]);

  useEffect(() => {
    if (loadedTaskKey === taskStorageKey) window.localStorage.setItem(taskStorageKey, JSON.stringify(tasks));
  }, [loadedTaskKey, taskStorageKey, tasks]);

  useEffect(() => {
    const legacyBoardKey = boardKind === "white" ? `northstar-board-v1:${encodeURIComponent(storageScope)}:${selectedKey}` : undefined;
    setStrokes(readArray<InkStroke>(boardStorageKey, legacyBoardKey));
    setLoadedBoardKey(boardStorageKey);
  }, [boardStorageKey]);

  useEffect(() => {
    if (loadedBoardKey === boardStorageKey) window.localStorage.setItem(boardStorageKey, JSON.stringify(strokes));
  }, [boardStorageKey, loadedBoardKey, strokes]);

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

  useEffect(() => {
    setPenColor(boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0]);
  }, [boardKind]);

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

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    setTasks((current) => [...current, { id: crypto.randomUUID(), title, done: false }]);
    setNewTask("");
  }

  function boardPoint(event: React.PointerEvent<SVGSVGElement>): InkPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT,
    };
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (loadedBoardKey !== boardStorageKey) return;
    if (event.button !== 0 && event.pointerType !== "pen") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: InkStroke = {
      points: [boardPoint(event)],
      color: tool === "eraser" ? (boardKind === "white" ? "#ffffff" : "#18231f") : penColor,
      width: tool === "eraser" ? eraserSize : penSize,
    };
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>) {
    const current = activeStrokeRef.current;
    if (!current) return;
    event.preventDefault();
    const next = { ...current, points: [...current.points, boardPoint(event)] };
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }

  function finishStroke() {
    const current = activeStrokeRef.current;
    if (!current) return;
    setStrokes((existing) => [...existing, current]);
    activeStrokeRef.current = null;
    setActiveStroke(null);
  }

  function createNote() {
    const note: StudyNote = { id: crypto.randomUUID(), title: "", subject: "", body: "", updatedAt: Date.now() };
    setNotes((current) => [note, ...current]);
    setSelectedNoteId(note.id);
  }

  function updateSelectedNote(patch: Partial<Pick<StudyNote, "title" | "subject" | "body">>) {
    if (!selectedNoteId) return;
    setNotes((current) => current.map((note) => note.id === selectedNoteId ? { ...note, ...patch, updatedAt: Date.now() } : note));
  }

  function deleteNote(id: string) {
    const next = notes.filter((note) => note.id !== id);
    setNotes(next);
    if (selectedNoteId === id) setSelectedNoteId(next[0]?.id ?? null);
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

  const visibleStrokes = loadedBoardKey === boardStorageKey ? strokes : [];
  const visibleTasks = loadedTaskKey === taskStorageKey ? tasks : [];
  const allStrokes = activeStroke && loadedBoardKey === boardStorageKey ? [...visibleStrokes, activeStroke] : visibleStrokes;

  return (
    <div className="planit-app">
      <header className="planit-header">
        <div>
          <p className="planner-eyebrow">PLANIT</p>
          <h1>Make space for your plans.</h1>
          <p className="planner-date-range">Your days, study notes, and someday list in one place.</p>
        </div>
        <button type="button" className="planner-theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "white" : "dark"} theme`}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          <span>{theme === "dark" ? "White theme" : "Dark theme"}</span>
        </button>
      </header>

      <nav className="planit-tabs" role="tablist" aria-label="Planit sections">
        <button type="button" role="tab" aria-selected={section === "planner"} className={cn("planit-tab", section === "planner" && "is-active")} onClick={() => setSection("planner")}>
          <CalendarDays size={17} /> Planner
        </button>
        <button type="button" role="tab" aria-selected={section === "study"} className={cn("planit-tab", section === "study" && "is-active")} onClick={() => setSection("study")}>
          <BookOpen size={17} /> Study notes
        </button>
        <button type="button" role="tab" aria-selected={section === "bucket"} className={cn("planit-tab", section === "bucket" && "is-active")} onClick={() => setSection("bucket")}>
          <Lightbulb size={17} /> Bucket list
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
            <section className="planner-board-card" aria-label="Dated notebook">
              <div className="planner-card-heading planner-board-heading">
                <div>
                  <h2>{boardKind === "white" ? "Whiteboard" : "Blackboard"}</h2>
                  <p>Write or sketch with your finger or Apple Pencil.</p>
                </div>
                <div className="planner-board-switch" role="group" aria-label="Board color">
                  <button type="button" className={cn(boardKind === "white" && "is-active")} onClick={() => setBoardKind("white")}>White</button>
                  <button type="button" className={cn(boardKind === "black" && "is-active")} onClick={() => setBoardKind("black")}>Black</button>
                </div>
              </div>

              <div className="planner-toolbar">
                <div className="planner-tool-pair">
                  <button type="button" className={cn("planner-tool-button", tool === "pen" && "is-active")} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}>
                    <NotebookPen size={16} /> Pen
                  </button>
                  <button type="button" className={cn("planner-tool-button", tool === "eraser" && "is-active")} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}>
                    <Eraser size={16} /> Eraser
                  </button>
                </div>
                {tool === "pen" ? (
                  <div className="planner-ink-controls">
                    <div className="planner-color-palette" role="group" aria-label="Pen color">
                      {(boardKind === "white" ? WHITE_INKS : CHALK_INKS).map((color) => (
                        <button key={color} type="button" className={cn("planner-color-swatch", penColor === color && "is-selected")} style={{ "--swatch-color": color } as React.CSSProperties} onClick={() => setPenColor(color)} aria-label={`Pen color ${color}`} aria-pressed={penColor === color} />
                      ))}
                    </div>
                    <label className="planner-size-control"><span>Pen size</span><input type="range" min="1.5" max="11" step="0.5" value={penSize} onChange={(event) => setPenSize(Number(event.target.value))} /><output>{penSize}px</output></label>
                  </div>
                ) : (
                  <label className="planner-size-control planner-eraser-size"><span>Eraser size</span><input type="range" min="10" max="72" step="2" value={eraserSize} onChange={(event) => setEraserSize(Number(event.target.value))} /><output>{eraserSize}px</output></label>
                )}
                <div className="planner-board-actions">
                  <button type="button" className="planner-tool-button planner-action-button" onClick={() => setStrokes((current) => current.slice(0, -1))} disabled={loadedBoardKey !== boardStorageKey || !strokes.length} aria-label="Undo last stroke" title="Undo last stroke"><Undo2 size={17} /></button>
                  <button type="button" className="planner-tool-button planner-action-button" onClick={() => setStrokes([])} disabled={loadedBoardKey !== boardStorageKey || !strokes.length} aria-label="Clear this dated board" title="Clear this board"><Trash2 size={17} /></button>
                </div>
              </div>

              <div className={cn("planner-whiteboard", boardKind === "black" && "is-blackboard")} aria-label={`${boardKind}board drawing area`}>
                <svg
                  viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
                  preserveAspectRatio="none"
                  className="planner-whiteboard-svg"
                  onPointerDown={startStroke}
                  onPointerMove={continueStroke}
                  onPointerUp={finishStroke}
                  onPointerCancel={finishStroke}
                  role="img"
                  aria-label={`Blank ${boardKind}board. Draw using touch or Apple Pencil.`}
                >
                  {allStrokes.map((stroke, index) => (
                    <path key={index} d={strokePath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
              </div>
              <p className="planner-local-note">Each date and board keeps its own page on this device.</p>
            </section>

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
            <div className="study-editor">
              {selectedNote ? (
                <>
                  <div className="study-editor-top">
                    <span>Autosaves on this device</span>
                    <button type="button" className="planner-tool-button planner-action-button" onClick={() => deleteNote(selectedNote.id)} aria-label="Delete note"><Trash2 size={16} /></button>
                  </div>
                  <input className="study-title-input" value={selectedNote.title} onChange={(event) => updateSelectedNote({ title: event.target.value })} placeholder="Note title" maxLength={120} />
                  <input className="study-subject-input" value={selectedNote.subject} onChange={(event) => updateSelectedNote({ subject: event.target.value })} placeholder="Subject or class" maxLength={60} />
                  <textarea className="study-body-input" value={selectedNote.body} onChange={(event) => updateSelectedNote({ body: event.target.value })} placeholder="Start writing your notes…" />
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
                  <button type="button" className="planner-task-delete" onClick={() => setBucketItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.title}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <p className="planit-empty">Nothing here yet. Add an idea you want to remember.</p>}
          <p className="planner-local-note">Your list stays on this device.</p>
        </section>
      )}
    </div>
  );
}

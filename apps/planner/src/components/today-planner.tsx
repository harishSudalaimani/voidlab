"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Check,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Images,
  Lightbulb,
  Moon,
  NotebookPen,
  PenLine,
  Plus,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/logo";
import { DrawingNotebook } from "@/components/drawing-notebook";
import { PortfolioEditor } from "@/components/portfolio-editor";
import { Gallery } from "@/components/gallery";
import { ActivityTracker } from "@/components/activity-tracker";
import { WelcomeCosmos } from "@/components/welcome-cosmos";
import { CollectionBoard } from "@/components/collection-board";

type DayTask = { id: string; title: string; done: boolean };
type Theme = "dark" | "light";
type Section = "planner" | "study" | "bucket" | "wishlist" | "activity" | "portfolio" | "gallery";
type NotebookStyle = "linen" | "botanical" | "modern" | "midnight";
type NotebookMeta = { id: string; name: string; style: NotebookStyle; paperColor: string; createdAt: number };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const START_DATE = "2027-01-01";
const END_DATE = "2027-12-31";
const NOTEBOOK_STYLES: { id: NotebookStyle; name: string; description: string }[] = [
  { id: "linen", name: "Linen", description: "Quiet cloth texture" },
  { id: "botanical", name: "Botanical", description: "Soft garden green" },
  { id: "modern", name: "Modern", description: "Clean graphic cover" },
  { id: "midnight", name: "Midnight", description: "Deep dark cover" },
];
const NOTEBOOK_PAPERS = [
  { color: "#fffdf5", label: "Ivory" },
  { color: "#f3e8d4", label: "Cream" },
  { color: "#e8efe3", label: "Sage" },
  { color: "#202923", label: "Dark" },
];

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
  const [calendarMonth, setCalendarMonth] = useState(() => dateFromKey(START_DATE));
  const selectedKey = dateKey(selectedDate);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [loadedTaskKey, setLoadedTaskKey] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const [notebooks, setNotebooks] = useState<NotebookMeta[]>([]);
  const [loadedNotebooksKey, setLoadedNotebooksKey] = useState<string | null>(null);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [showNotebookForm, setShowNotebookForm] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newNotebookStyle, setNewNotebookStyle] = useState<NotebookStyle>("linen");
  const [newNotebookPaper, setNewNotebookPaper] = useState(NOTEBOOK_PAPERS[0].color);

  const taskStorageKey = `planit-day-v1:${encodeURIComponent(storageScope)}:${selectedKey}`;
  const notebooksStorageKey = `planit-notebook-library-v1:${encodeURIComponent(storageScope)}`;
  const activeNotebook = notebooks.find((notebook) => notebook.id === activeNotebookId) ?? null;
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
    setNotebooks(readArray<NotebookMeta>(notebooksStorageKey));
    setLoadedNotebooksKey(notebooksStorageKey);
  }, [notebooksStorageKey]);

  useEffect(() => {
    if (loadedNotebooksKey === notebooksStorageKey) window.localStorage.setItem(notebooksStorageKey, JSON.stringify(notebooks));
  }, [loadedNotebooksKey, notebooks, notebooksStorageKey]);

  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
    const firstVisibleDay = startOfWeek(firstOfMonth);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const cellCount = Math.ceil(((firstOfMonth.getDay() + 6) % 7 + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(firstVisibleDay);
      date.setDate(firstVisibleDay.getDate() + index);
      return date;
    });
  }, [calendarMonth]);

  function selectDate(key: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < START_DATE || key > END_DATE) return;
    const next = dateFromKey(key);
    if (dateKey(next) === key) {
      setSelectedDate(next);
      setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1, 12));
    }
  }

  function shiftCalendarMonth(amount: number) {
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1, 12);
    if (next.getFullYear() !== 2027) return;
    setCalendarMonth(next);
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

  function createNotebook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newNotebookName.trim();
    if (!name) return;
    const notebook: NotebookMeta = {
      id: crypto.randomUUID(),
      name,
      style: newNotebookStyle,
      paperColor: newNotebookPaper,
      createdAt: Date.now(),
    };
    setNotebooks((current) => [notebook, ...current]);
    setShowNotebookForm(false);
    setNewNotebookName("");
  }

  const visibleTasks = loadedTaskKey === taskStorageKey ? tasks : [];

  return (
    <div className="planit-app">
      <div className="workspace-cosmos" aria-hidden="true"><WelcomeCosmos theme={theme} /></div>
      <header className="planit-header">
        <div className="planner-brand-lockup">
          <Logo withWordmark={false} />
          <span>KIROKU</span>
        </div>
        <div className="planit-header-actions">
          {!isInstalled && (
            <div className="planit-install-wrap">
              <button type="button" className="planit-install-button" onClick={installKiroku} aria-label="Install Kiroku" title="Install Kiroku"><Download size={16} /></button>
              {installHelpOpen && (
                <div className="planit-install-help" role="status">
                  <button type="button" onClick={() => setInstallHelpOpen(false)} aria-label="Close install instructions"><X size={15} /></button>
                  <strong>Add Kiroku to your device</strong>
                  <p>Android: in Chrome, tap the menu and choose “Install app” or “Add to Home screen.” iPhone or iPad: in Safari, tap Share, then “Add to Home Screen.” Desktop: use the install icon in Chrome or Edge, or choose “Install app” from the browser menu.</p>
                </div>
              )}
            </div>
          )}
          <button type="button" className="planner-theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "white" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "white" : "dark"} theme`} aria-pressed={theme === "light"}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <nav className="planit-tabs" role="tablist" aria-label="Kiroku sections">
        <button type="button" role="tab" aria-selected={section === "planner"} className={cn("planit-tab", section === "planner" && "is-active")} onClick={() => setSection("planner")}>
          <CalendarDays size={17} /> Planner
        </button>
        <button type="button" role="tab" aria-selected={section === "study"} className={cn("planit-tab", section === "study" && "is-active")} onClick={() => setSection("study")}>
          <NotebookPen size={17} /> Notebook
        </button>
        <button type="button" role="tab" aria-selected={section === "bucket"} className={cn("planit-tab", section === "bucket" && "is-active")} onClick={() => setSection("bucket")}>
          <Lightbulb size={17} /> Bucket list
        </button>
        <button type="button" role="tab" aria-selected={section === "wishlist"} className={cn("planit-tab", section === "wishlist" && "is-active")} onClick={() => setSection("wishlist")}>
          <Heart size={17} /> Wishlist
        </button>
        <button type="button" role="tab" aria-selected={section === "activity"} className={cn("planit-tab", section === "activity" && "is-active")} onClick={() => setSection("activity")}>
          <Activity size={17} /> Activity
        </button>
        <button type="button" role="tab" aria-selected={section === "portfolio"} className={cn("planit-tab", section === "portfolio" && "is-active")} onClick={() => setSection("portfolio")}>
          <PenLine size={17} /> Persona
        </button>
        <button type="button" role="tab" aria-selected={section === "gallery"} className={cn("planit-tab", section === "gallery" && "is-active")} onClick={() => setSection("gallery")}>
          <Images size={17} /> Gallery
        </button>
      </nav>

      {section === "planner" && (
        <div className="planner-screen" role="tabpanel">
          <div className="planner-workspace">
            <DrawingNotebook storageScope={storageScope} bookId={`planner-${selectedKey}`} title="Planner board" legacyDateKey={selectedKey} compactControls />

            <aside className="planner-side-column">
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
                ) : null}
              </section>

              <section className="planner-calendar" aria-label="Choose a planner date">
                <div className="planner-calendar-heading">
                  <div>
                    <h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth)}</h2>
                  </div>
                  <div className="planner-calendar-actions">
                    <div className="planner-month-nav" aria-label="Change month">
                      <button type="button" className="planner-icon-button" onClick={() => shiftCalendarMonth(-1)} aria-label="Previous month" disabled={calendarMonth.getMonth() === 0}>
                        <ChevronLeft size={17} />
                      </button>
                      <button type="button" className="planner-icon-button" onClick={() => shiftCalendarMonth(1)} aria-label="Next month" disabled={calendarMonth.getMonth() === 11}>
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="planner-month-grid" role="group" aria-label={new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarMonth)}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => <span className="planner-weekday-label" key={weekday}>{weekday}</span>)}
                  {calendarDays.map((date) => {
                    const key = dateKey(date);
                    const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                    return (
                      <button key={key} type="button" onClick={() => selectDate(key)} disabled={key < START_DATE || key > END_DATE} aria-label={new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date)} aria-pressed={key === selectedKey} className={cn("planner-day-button", !isCurrentMonth && "is-outside-month", key === selectedKey && "is-selected")}>
                        <span>{date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {section === "study" && (
        <section className="planit-section notebook-library" role="tabpanel" aria-label="Notebook">
          {activeNotebook ? (
            <>
              <div className="section-title-row notebook-open-heading">
                <button type="button" className="planit-secondary-button" onClick={() => setActiveNotebookId(null)}><ChevronLeft size={16} /> Notebooks</button>
                <h2>{activeNotebook.name}</h2>
              </div>
              <DrawingNotebook storageScope={storageScope} bookId={`study-${activeNotebook.id}`} title={activeNotebook.name} compactControls notebookMode paperColor={activeNotebook.paperColor} />
            </>
          ) : (
            <>
              <div className="section-title-row">
                <div><h2>Notebooks</h2></div>
                <button type="button" className="planit-primary-button" onClick={() => setShowNotebookForm((visible) => !visible)}><Plus size={17} /> Create notebook</button>
              </div>
              {showNotebookForm && (
                <form className="notebook-create-form" onSubmit={createNotebook}>
                  <label className="notebook-create-name"><span>Cover name</span><input autoFocus value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} placeholder="For example, Travel journal" maxLength={80} required /></label>
                  <fieldset className="notebook-choice-group">
                    <legend>Cover style</legend>
                    <div className="notebook-style-options">
                      {NOTEBOOK_STYLES.map((style) => <button key={style.id} type="button" className={cn("notebook-style-option", `notebook-cover-${style.id}`, newNotebookStyle === style.id && "is-selected")} onClick={() => setNewNotebookStyle(style.id)} aria-pressed={newNotebookStyle === style.id}><strong>{style.name}</strong><small>{style.description}</small></button>)}
                    </div>
                  </fieldset>
                  <fieldset className="notebook-choice-group">
                    <legend>Page color</legend>
                    <div className="notebook-paper-options">
                      {NOTEBOOK_PAPERS.map((paper) => <button key={paper.color} type="button" className={cn("notebook-paper-option", newNotebookPaper === paper.color && "is-selected")} onClick={() => setNewNotebookPaper(paper.color)} aria-pressed={newNotebookPaper === paper.color}><span style={{ backgroundColor: paper.color }} />{paper.label}</button>)}
                    </div>
                  </fieldset>
                  <div className="notebook-create-actions"><button type="button" className="planit-secondary-button" onClick={() => setShowNotebookForm(false)}>Cancel</button><button type="submit" className="planit-primary-button" disabled={!newNotebookName.trim()}><BookOpen size={16} /> Create</button></div>
                </form>
              )}
              {notebooks.length ? (
                <div className="notebook-cover-grid">
                  {notebooks.map((notebook) => (
                    <button key={notebook.id} type="button" className={cn("notebook-cover", `notebook-cover-${notebook.style}`)} onClick={() => setActiveNotebookId(notebook.id)}>
                      <span className="notebook-cover-edge" />
                      <span className="notebook-cover-stamp"><NotebookPen size={19} /></span>
                      <strong>{notebook.name}</strong>
                      <small>{NOTEBOOK_STYLES.find((style) => style.id === notebook.style)?.name ?? "Notebook"}</small>
                      <span className="notebook-cover-paper"><i style={{ backgroundColor: notebook.paperColor }} /> {NOTEBOOK_PAPERS.find((paper) => paper.color === notebook.paperColor)?.label ?? "Custom paper"}</span>
                    </button>
                  ))}
                </div>
              ) : !showNotebookForm ? <p className="notebook-library-empty">Create a notebook to start writing and drawing.</p> : null}
            </>
          )}
        </section>
      )}

      {section === "bucket" && <CollectionBoard kind="bucket" storageScope={storageScope} />}
      {section === "wishlist" && <CollectionBoard kind="wishlist" storageScope={storageScope} />}

      {section === "activity" && <ActivityTracker storageScope={storageScope} />}
      {section === "portfolio" && <PortfolioEditor />}
      {section === "gallery" && <Gallery storageScope={storageScope} />}
    </div>
  );
}

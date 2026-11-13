"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Plus,
  Sparkles,
  Sunrise,
  Sunset,
} from "lucide-react";
import { cn } from "@/lib/cn";

type DayTask = { id: string; title: string; time: string; done: boolean };
type DayPlan = {
  tasks: DayTask[];
  habits: string[];
  intention: string;
  journal: string;
};

const HABITS = [
  { id: "move", label: "Move your body", detail: "A little counts", icon: Sunrise },
  { id: "read", label: "Read a few pages", detail: "Make space to learn", icon: BookOpenText },
  { id: "wind-down", label: "Evening wind-down", detail: "Close the day gently", icon: Sunset },
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function starterPlan(): DayPlan {
  return {
    tasks: [
      { id: "starter-1", title: "Choose the three things that matter today", time: "09:00", done: false },
      { id: "starter-2", title: "Take a proper lunch break", time: "12:30", done: false },
      { id: "starter-3", title: "Make a little progress on a yearly goal", time: "15:00", done: false },
    ],
    habits: [],
    intention: "",
    journal: "",
  };
}

function emptyPlan(): DayPlan {
  return { tasks: [], habits: [], intention: "", journal: "" };
}

function startOfWeek(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function formatTime(time: string) {
  if (!time) return "Anytime";
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export function TodayPlanner({
  initialDateKey,
  storageScope,
}: {
  initialDateKey: string;
  storageScope: string;
}) {
  const [selectedDate, setSelectedDate] = useState(() => dateFromKey(initialDateKey));
  const selectedKey = dateKey(selectedDate);
  const [todayKey, setTodayKey] = useState(initialDateKey);
  const [plan, setPlan] = useState<DayPlan>(() => starterPlan());
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const storageKey = `northstar-day-v1:${encodeURIComponent(storageScope)}:${selectedKey}`;

  useEffect(() => {
    const today = new Date();
    setTodayKey(dateKey(today));
    setSelectedDate(today);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DayPlan;
        setPlan({
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          habits: Array.isArray(parsed.habits) ? parsed.habits : [],
          intention: typeof parsed.intention === "string" ? parsed.intention : "",
          journal: typeof parsed.journal === "string" ? parsed.journal : "",
        });
      } catch {
        setPlan(selectedKey === todayKey ? starterPlan() : emptyPlan());
      }
    } else {
      setPlan(selectedKey === todayKey ? starterPlan() : emptyPlan());
    }
    setLoadedKey(storageKey);
  }, [selectedKey, storageKey, todayKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(plan));
  }, [loadedKey, plan, selectedKey, storageKey]);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const completedCount = plan.tasks.filter((task) => task.done).length;
  const progress = plan.tasks.length ? Math.round((completedCount / plan.tasks.length) * 100) : 0;
  const sortedTasks = [...plan.tasks].sort((left, right) => (left.time || "99:99").localeCompare(right.time || "99:99"));

  function shiftDate(amount: number) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount);
    setSelectedDate(next);
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    setPlan((current) => ({
      ...current,
      tasks: [...current.tasks, { id: crypto.randomUUID(), title, time: "", done: false }],
    }));
    setNewTask("");
  }

  function toggleTask(id: string) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task),
    }));
  }

  function toggleHabit(id: string) {
    setPlan((current) => ({
      ...current,
      habits: current.habits.includes(id)
        ? current.habits.filter((habit) => habit !== id)
        : [...current.habits, id],
    }));
  }

  const fullDate = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(selectedDate);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-300">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> Daily planner
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">Make room for today.</h1>
          <p className="mt-2 text-sm text-mist-400">A clear plan, a kinder pace, and a moment to reflect.</p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-2xl border border-white/10 bg-white/[0.035] p-1.5 xl:self-auto">
          <button type="button" onClick={() => shiftDate(-1)} className="rounded-xl p-2 text-mist-400 transition hover:bg-white/10 hover:text-mist-100" aria-label="Previous day">
            <ChevronLeft size={17} />
          </button>
          <div className="min-w-40 px-2 text-center">
            <p className="text-sm font-semibold text-mist-100">{selectedKey === todayKey ? "Today" : fullDate.split(",")[0]}</p>
            <p className="mt-0.5 text-[11px] text-mist-500">{fullDate}</p>
          </div>
          <button type="button" onClick={() => shiftDate(1)} className="rounded-xl p-2 text-mist-400 transition hover:bg-white/10 hover:text-mist-100" aria-label="Next day">
            <ChevronRight size={17} />
          </button>
          {selectedKey !== todayKey && (
            <button type="button" onClick={() => setSelectedDate(new Date())} className="mr-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-accent-300 transition hover:bg-accent-400/10">
              Today
            </button>
          )}
        </div>
      </header>

      <section className="surface overflow-hidden p-3 sm:p-4" aria-label="Week picker">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDays.map((date) => {
            const key = dateKey(date);
            const selected = key === selectedKey;
            return (
              <button key={key} type="button" onClick={() => setSelectedDate(date)} aria-pressed={selected}
                className={cn("rounded-xl px-1 py-2.5 text-center transition sm:rounded-2xl sm:py-3", selected ? "bg-accent-400 text-ink-950 shadow-[0_8px_24px_-12px_rgba(52,211,153,0.8)]" : "text-mist-400 hover:bg-white/[0.06] hover:text-mist-100")}>
                <span className={cn("block text-[10px] font-semibold uppercase tracking-wide", selected ? "text-ink-950/65" : "text-mist-500")}>
                  {new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}
                </span>
                <span className="mt-1 block text-sm font-bold">{date.getDate()}</span>
                {key === todayKey && <span className={cn("mx-auto mt-1 block h-1 w-1 rounded-full", selected ? "bg-ink-950" : "bg-accent-400")} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="surface flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-400/10 text-accent-300"><Check size={18} /></span>
          <div><p className="text-xl font-bold text-mist-100">{completedCount}<span className="ml-1 text-sm font-medium text-mist-500">/ {plan.tasks.length}</span></p><p className="text-xs text-mist-500">Tasks complete</p></div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-400/10 text-violet-300"><Sparkles size={18} /></span>
          <div><p className="text-xl font-bold text-mist-100">{plan.habits.length}<span className="ml-1 text-sm font-medium text-mist-500">/ {HABITS.length}</span></p><p className="text-xs text-mist-500">Habits checked in</p></div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-sky-300"><CalendarDays size={18} /></span>
          <div className="min-w-0 flex-1"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-mist-100">Your pace</p><p className="text-xs text-mist-400">{progress}%</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-accent-500 to-violet-400 transition-all" style={{ width: `${progress}%` }} /></div></div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-300">Your day</p><h2 className="mt-1 text-lg font-semibold text-mist-100">A few things to move forward</h2><p className="mt-1 text-xs text-mist-500">Keep it light. You can always add more later.</p></div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-mist-400">{plan.tasks.length} {plan.tasks.length === 1 ? "task" : "tasks"}</span>
          </div>

          {sortedTasks.length > 0 ? (
            <div className="mt-5 divide-y divide-white/[0.06]">
              {sortedTasks.map((task) => (
                <div key={task.id} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="w-16 shrink-0 text-right text-[11px] font-medium text-mist-500">{formatTime(task.time)}</span>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", task.done ? "bg-accent-400" : "bg-white/20")} />
                  <button type="button" onClick={() => toggleTask(task.id)} aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} aria-pressed={task.done}
                    className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left transition hover:bg-white/[0.035]", task.done && "opacity-60")}>
                    {task.done ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-400 text-ink-950"><Check size={12} strokeWidth={3} /></span> : <Circle size={20} className="shrink-0 text-mist-600 transition group-hover:text-accent-300" />}
                    <span className={cn("text-sm font-medium text-mist-200", task.done && "text-mist-500 line-through")}>{task.title}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
              <Clock3 size={20} className="mx-auto text-mist-600" />
              <p className="mt-2 text-sm font-medium text-mist-300">A little breathing room.</p>
              <p className="mt-1 text-xs text-mist-500">Add a task when you know what deserves your attention.</p>
            </div>
          )}

          <form onSubmit={addTask} className="mt-5 flex gap-2 border-t border-white/[0.06] pt-4">
            <label className="sr-only" htmlFor="today-new-task">Add a task</label>
            <input id="today-new-task" value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add one thing to your day…" maxLength={140}
              className="input min-w-0 flex-1 bg-ink-950/40" />
            <button type="submit" disabled={!newTask.trim()} className="btn btn-primary px-3" aria-label="Add task"><Plus size={17} /><span className="hidden sm:inline">Add task</span></button>
          </form>
        </section>

        <div className="space-y-4">
          <section className="surface p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Small rituals</p><h2 className="mt-1 text-lg font-semibold text-mist-100">Habits that ground you</h2></div>
              <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-semibold text-violet-300">{plan.habits.length}/{HABITS.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {HABITS.map(({ id, label, detail, icon: Icon }) => {
                const done = plan.habits.includes(id);
                return <button key={id} type="button" onClick={() => toggleHabit(id)} aria-pressed={done}
                  className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", done ? "border-accent-400/20 bg-accent-400/[0.07]" : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.045]")}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", done ? "bg-accent-400/15 text-accent-300" : "bg-white/[0.05] text-mist-500")}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-mist-200">{label}</span><span className="mt-0.5 block text-[10px] text-mist-500">{detail}</span></span>
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border", done ? "border-accent-400 bg-accent-400 text-ink-950" : "border-white/15 text-transparent")}><Check size={12} strokeWidth={3} /></span>
                </button>;
              })}
            </div>
          </section>

          <section className="surface p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">A moment for you</p><h2 className="mt-1 text-lg font-semibold text-mist-100">Daily reflection</h2></div>
              <BookOpenText size={18} className="text-sky-300" />
            </div>
            <label className="mt-4 block text-xs font-medium text-mist-300" htmlFor="today-intention">What would make today feel meaningful?</label>
            <input id="today-intention" value={plan.intention} onChange={(event) => setPlan((current) => ({ ...current, intention: event.target.value }))} maxLength={180}
              placeholder="One thing I want to make space for…" className="input mt-2 bg-ink-950/40 text-xs" />
            <label className="mt-4 block text-xs font-medium text-mist-300" htmlFor="today-journal">A few lines about today</label>
            <textarea id="today-journal" value={plan.journal} onChange={(event) => setPlan((current) => ({ ...current, journal: event.target.value }))} maxLength={4000} rows={4}
              placeholder="What went well? What are you carrying into tomorrow?" className="input mt-2 resize-y bg-ink-950/40 text-xs leading-relaxed" />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-mist-600">Saved on this device</span>
              <Link href="/planner" className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-300 hover:text-accent-200">Yearly goals <ArrowRight size={12} /></Link>
            </div>
          </section>
        </div>
      </div>

      <div className="pb-2 text-center text-[10px] text-mist-600">
        Your daily plan stays in this browser for now.
      </div>
    </div>
  );
}

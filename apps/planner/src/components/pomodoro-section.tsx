"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, Settings2, SkipForward, TimerReset } from "lucide-react";
import { cn } from "@/lib/cn";

type Phase = "focus" | "short" | "long";
type PomodoroSettings = { focus: number; short: number; long: number; longEvery: number };
type SavedTimer = { settings: PomodoroSettings; phase: Phase; completed: number; remainingMs: number; deadline: number | null; sessions: number[] };

const DEFAULTS: PomodoroSettings = { focus: 25, short: 5, long: 15, longEvery: 4 };
const PHASES: { id: Phase; label: string; caption: string }[] = [
  { id: "focus", label: "Focus", caption: "Work with one thing in mind." },
  { id: "short", label: "Short break", caption: "Take a breath and reset." },
  { id: "long", label: "Long break", caption: "Step away for a little longer." },
];

function validSettings(value: unknown): PomodoroSettings {
  if (!value || typeof value !== "object") return DEFAULTS;
  const candidate = value as Partial<PomodoroSettings>;
  const number = (item: unknown, fallback: number, min: number, max: number) => typeof item === "number" && Number.isFinite(item) ? Math.max(min, Math.min(max, Math.round(item))) : fallback;
  return { focus: number(candidate.focus, 25, 1, 180), short: number(candidate.short, 5, 1, 60), long: number(candidate.long, 15, 1, 120), longEvery: number(candidate.longEvery, 4, 2, 12) };
}

export function PomodoroSection({ storageScope }: { storageScope: string }) {
  const storageKey = `planit-pomodoro-v1:${encodeURIComponent(storageScope)}`;
  const [settings, setSettings] = useState(DEFAULTS);
  const [phase, setPhase] = useState<Phase>("focus");
  const [completed, setCompleted] = useState(0);
  const [sessions, setSessions] = useState<number[]>([]);
  const [remainingMs, setRemainingMs] = useState(DEFAULTS.focus * 60_000);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [persistVersion, setPersistVersion] = useState(0);

  const durationMs = settings[phase] * 60_000;
  const seconds = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, 1 - remainingMs / durationMs));
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const currentPhase = PHASES.find((item) => item.id === phase)!;
  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions]);
  const todayCount = useMemo(() => {
    const today = new Date();
    return sessions.filter((session) => {
      const date = new Date(session);
      return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    }).length;
  }, [sessions]);

  useEffect(() => {
    setLoadedScope(null);
    setSettings(DEFAULTS);
    setPhase("focus");
    setCompleted(0);
    setSessions([]);
    setRemainingMs(DEFAULTS.focus * 60_000);
    setDeadline(null);
    setRunning(false);
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value) {
        const saved = JSON.parse(value) as Partial<SavedTimer>;
        const nextSettings = validSettings(saved.settings);
        const nextPhase: Phase = saved.phase === "short" || saved.phase === "long" ? saved.phase : "focus";
        const nextDeadline = typeof saved.deadline === "number" && Number.isFinite(saved.deadline) ? saved.deadline : null;
        setSettings(nextSettings); setPhase(nextPhase); setCompleted(Number.isFinite(saved.completed) ? Math.max(0, Math.floor(saved.completed!)) : 0);
        setRemainingMs(nextDeadline ? Math.max(0, nextDeadline - Date.now()) : typeof saved.remainingMs === "number" && Number.isFinite(saved.remainingMs) ? Math.max(0, saved.remainingMs) : nextSettings[nextPhase] * 60_000);
        setDeadline(nextDeadline); setRunning(Boolean(nextDeadline));
        setSessions(Array.isArray(saved.sessions) ? saved.sessions.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0 && item <= Date.now() + 86_400_000).slice(0, 100) : []);
      }
    } catch { /* Keep the default timer if browser storage is unavailable. */ }
    setLoadedScope(storageScope);
  }, [storageKey]);

  useEffect(() => {
    if (!running || !deadline) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        setRunning(false); setDeadline(null);
        if (phase === "focus") {
          const nextCount = completed + 1;
          setCompleted(nextCount); setSessions((current) => [Date.now(), ...current].slice(0, 100));
          const nextPhase: Phase = nextCount % settings.longEvery === 0 ? "long" : "short";
          setPhase(nextPhase); setRemainingMs(settings[nextPhase] * 60_000);
        } else {
          setPhase("focus"); setRemainingMs(settings.focus * 60_000);
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [running, deadline, phase, completed, settings]);

  useEffect(() => {
    if (loadedScope !== storageScope) return;
    const savedRemaining = running && deadline ? Math.max(0, deadline - Date.now()) : remainingMs;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ settings, phase, completed, remainingMs: savedRemaining, deadline, sessions } satisfies SavedTimer)); }
    catch { /* The timer still works for this session when storage is full or blocked. */ }
  }, [loadedScope, storageScope, storageKey, settings, phase, completed, deadline, running, sessions, persistVersion]);

  function choosePhase(next: Phase) {
    setRunning(false); setDeadline(null); setPhase(next); setRemainingMs(settings[next] * 60_000); setPersistVersion((value) => value + 1);
  }
  function toggleTimer() {
    if (running) {
      const left = Math.max(0, (deadline ?? Date.now()) - Date.now());
      setRunning(false); setDeadline(null); setRemainingMs(left); setPersistVersion((value) => value + 1);
    } else {
      const nextDeadline = Date.now() + remainingMs;
      setDeadline(nextDeadline); setRunning(true); setPersistVersion((value) => value + 1);
    }
  }
  function resetTimer() { setRunning(false); setDeadline(null); setRemainingMs(settings[phase] * 60_000); setPersistVersion((value) => value + 1); }
  function skipPhase() {
    if (phase === "focus") {
      const nextPhase: Phase = (completed + 1) % settings.longEvery === 0 ? "long" : "short"; choosePhase(nextPhase);
    } else choosePhase("focus");
  }
  function changeSetting(key: keyof PomodoroSettings, value: number) {
    const next = validSettings({ ...settings, [key]: value });
    setSettings(next);
    if (!running) setRemainingMs(next[phase] * 60_000);
    setPersistVersion((version) => version + 1);
  }

  return (
    <section className="pomodoro-section" aria-label="Pomodoro focus timer">
      <header className="pomodoro-heading">
        <div><p className="pomodoro-eyebrow">Make a little room for focus</p><h2>Pomodoro</h2><p>Work in clear sessions, then take a proper break.</p></div>
        <button type="button" className="pomodoro-settings-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}><Settings2 size={17} /> Settings</button>
      </header>

      <div className="pomodoro-layout">
        <main className="pomodoro-timer-card">
          <div className="pomodoro-phase-tabs" role="tablist" aria-label="Timer mode">{PHASES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={phase === item.id} className={cn("pomodoro-phase-tab", phase === item.id && "is-active")} onClick={() => choosePhase(item.id)}>{item.label}</button>)}</div>
          <div className="pomodoro-clock-wrap" data-phase={phase}>
            <svg className="pomodoro-ring" viewBox="0 0 240 240" aria-hidden="true"><circle className="pomodoro-ring-track" cx="120" cy="120" r="108" /><circle className="pomodoro-ring-progress" cx="120" cy="120" r="108" pathLength="100" strokeDasharray={`${progress * 100} 100`} /></svg>
            <div className="pomodoro-clock-face"><span className="pomodoro-clock" role="timer" aria-live="off">{clock}</span><span className="pomodoro-phase-caption">{running ? "Stay with it" : currentPhase.caption}</span></div>
          </div>
          <div className="pomodoro-controls"><button type="button" className="pomodoro-start-button" onClick={toggleTimer}>{running ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{running ? "Pause" : remainingMs < durationMs ? "Resume" : phase === "focus" ? "Start focus" : `Start ${phase} break`}</button><button type="button" className="pomodoro-icon-control" onClick={resetTimer} aria-label="Reset timer" title="Reset"><RotateCcw size={17} /></button><button type="button" className="pomodoro-icon-control" onClick={skipPhase} aria-label="Skip to next phase" title="Skip phase"><SkipForward size={17} /></button></div>
          <div className="pomodoro-completed"><TimerReset size={16} /><strong>{completed}</strong><span>focus sessions completed</span></div>
        </main>

        <aside className="pomodoro-side-card">
          {showSettings ? <div className="pomodoro-settings-panel"><h3>Timer lengths</h3>{(["focus", "short", "long"] as const).map((key) => <label key={key}><span>{key === "focus" ? "Focus" : key === "short" ? "Short break" : "Long break"}</span><span className="pomodoro-setting-input"><input type="number" min={1} max={key === "focus" ? 180 : key === "short" ? 60 : 120} value={settings[key]} disabled={running} onChange={(event) => changeSetting(key, Number(event.target.value))} /><small>min</small></span></label>)}<label><span>Long break every</span><span className="pomodoro-setting-input"><input type="number" min={2} max={12} value={settings.longEvery} disabled={running} onChange={(event) => changeSetting("longEvery", Number(event.target.value))} /><small>sessions</small></span></label></div> : <><div className="pomodoro-side-heading"><div><span>Today</span><h3>Your rhythm</h3></div><span className="pomodoro-count-badge">{todayCount}</span></div><p className="pomodoro-side-copy">{currentPhase.caption} Your timer keeps its place if you switch to another section or reload.</p><div className="pomodoro-session-list"><h4>Recent focus sessions</h4>{recentSessions.length ? recentSessions.map((date, index) => <div key={`${date}-${index}`}><span className="pomodoro-session-dot" /><span>Focus session</span><time dateTime={new Date(date).toISOString()}>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}</time></div>) : <p>Your completed sessions will show up here.</p>}</div><div className="pomodoro-cycle"><span className="pomodoro-cycle-label">Current cycle</span><div>{Array.from({ length: settings.longEvery }, (_, index) => <i key={index} className={index < completed % settings.longEvery ? "is-done" : index === completed % settings.longEvery ? "is-current" : ""} />)}</div><small>Long break after {settings.longEvery} focus sessions</small></div></>}
        </aside>
      </div>
    </section>
  );
}

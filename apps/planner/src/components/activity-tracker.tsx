"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bike, Footprints, MapPin, Pause, Play, Route, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

type ActivityKind = "Run" | "Walk" | "Cycle";
type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  distanceKm: number;
  durationSeconds: number;
  date: string;
};
type GpsPoint = { latitude: number; longitude: number; accuracy: number; timestamp: number };
type LiveSession = {
  kind: ActivityKind;
  status: "running" | "paused";
  distanceMeters: number;
  durationBeforeStartSeconds: number;
  startedAt: number | null;
  startedOn: string;
  lastPoint: GpsPoint | null;
};

const ACTIVITY_TYPES: ActivityKind[] = ["Run", "Walk", "Cycle"];

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function activityLabel(kind: ActivityKind) {
  return kind === "Cycle" ? "Cycling" : kind === "Run" ? "Running" : "Walking";
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatPace(durationSeconds: number, distanceKm: number) {
  if (!distanceKm) return "—";
  const secondsPerKm = Math.round(durationSeconds / distanceKm);
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")} / km`;
}

function activityIcon(kind: ActivityKind, size = 17) {
  return kind === "Cycle" ? <Bike size={size} /> : <Footprints size={size} />;
}

function distanceBetween(a: GpsPoint, b: GpsPoint) {
  const radians = (degrees: number) => degrees * (Math.PI / 180);
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const firstLatitude = radians(a.latitude);
  const secondLatitude = radians(b.latitude);
  const h = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function elapsedSeconds(session: LiveSession, now: number) {
  return session.durationBeforeStartSeconds
    + (session.status === "running" && session.startedAt !== null ? Math.floor((now - session.startedAt) / 1000) : 0);
}

function readActivities(raw: string | null): ActivityEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): ActivityEntry[] => {
      if (!value || typeof value !== "object") return [];
      const entry = value as Partial<ActivityEntry> & { durationMinutes?: unknown };
      if ((entry.kind !== "Run" && entry.kind !== "Walk" && entry.kind !== "Cycle")
        || typeof entry.id !== "string"
        || typeof entry.date !== "string"
        || !Number.isFinite(entry.distanceKm)) return [];
      const duration = Number.isFinite(entry.durationSeconds)
        ? entry.durationSeconds!
        : Number.isFinite(entry.durationMinutes) ? Number(entry.durationMinutes) * 60 : NaN;
      if (!Number.isFinite(duration) || duration < 0) return [];
      return [{ id: entry.id, kind: entry.kind, date: entry.date, distanceKm: entry.distanceKm!, durationSeconds: duration }];
    });
  } catch {
    return [];
  }
}

export function ActivityTracker({ storageScope }: { storageScope: string }) {
  const storageKey = `kiroku-activity-v2:${encodeURIComponent(storageScope)}`;
  const legacyStorageKey = `kiroku-activity-v1:${encodeURIComponent(storageScope)}`;
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [kind, setKind] = useState<ActivityKind>("Run");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [geoMessage, setGeoMessage] = useState("");
  const [savingError, setSavingError] = useState("");
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    let next: ActivityEntry[] = [];
    try {
      next = readActivities(window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey));
    } catch { /* Start with an empty activity list if browser storage is unavailable. */ }
    setActivities(next);
    setLoadedKey(storageKey);
  }, [legacyStorageKey, storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(activities)); } catch { /* Keep this session usable if browser storage is full. */ }
  }, [activities, loadedKey, storageKey]);

  useEffect(() => {
    if (!session || session.status !== "running") return;
    const timer = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [session?.status]);

  useEffect(() => () => {
    if (watchId.current !== null && "geolocation" in navigator) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const orderedActivities = useMemo(() => [...activities].sort((a, b) => b.date.localeCompare(a.date)), [activities]);
  const totalDistance = activities.reduce((sum, entry) => sum + entry.distanceKm, 0);
  const distanceFor = (activityKind: ActivityKind) => activities
    .filter((entry) => entry.kind === activityKind)
    .reduce((sum, entry) => sum + entry.distanceKm, 0);
  const liveDuration = session ? elapsedSeconds(session, clock) : 0;

  function stopGps() {
    if (watchId.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  function handlePosition(position: GeolocationPosition) {
    const next: GpsPoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
    if (next.accuracy > 35) {
      setGeoMessage("Waiting for a stronger GPS signal…");
      return;
    }
    setGeoMessage("GPS tracking is on. Keep this page open while recording.");
    setSession((current) => {
      if (!current || current.status !== "running") return current;
      if (!current.lastPoint) return { ...current, lastPoint: next };
      const meters = distanceBetween(current.lastPoint, next);
      const seconds = (next.timestamp - current.lastPoint.timestamp) / 1000;
      const speed = seconds > 0 ? meters / seconds : 0;
      const movementThreshold = Math.max(3, (current.lastPoint.accuracy + next.accuracy) * 0.2);
      const validMovement = seconds > 0 && meters >= movementThreshold && speed <= 55;
      return {
        ...current,
        lastPoint: meters < movementThreshold ? current.lastPoint : next,
        distanceMeters: current.distanceMeters + (validMovement ? meters : 0),
      };
    });
  }

  function handlePositionError(error: GeolocationPositionError) {
    stopGps();
    setSession((current) => current ? {
      ...current,
      status: "paused",
      durationBeforeStartSeconds: elapsedSeconds(current, Date.now()),
      startedAt: null,
      lastPoint: null,
    } : null);
    setGeoMessage(error.code === error.PERMISSION_DENIED
      ? "Location permission was denied. Enable it in your browser settings to continue."
      : "GPS signal was lost. Move to an open area and resume when ready.");
  }

  function startGpsTracking() {
    if (!navigator.geolocation) {
      setGeoMessage("This browser does not support GPS location.");
      return;
    }
    setGeoMessage("Waiting for GPS location…");
    try {
      watchId.current = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      });
    } catch {
      setGeoMessage("Could not start GPS tracking. Check browser location access.");
      return;
    }
  }

  function startSession() {
    setSavingError("");
    if (!navigator.geolocation) {
      setGeoMessage("This browser does not support GPS location.");
      return;
    }
    setSession({
      kind,
      status: "running",
      distanceMeters: 0,
      durationBeforeStartSeconds: 0,
      startedAt: Date.now(),
      startedOn: localDate(),
      lastPoint: null,
    });
    setClock(Date.now());
    startGpsTracking();
  }

  function pauseSession() {
    if (!session) return;
    const now = Date.now();
    stopGps();
    setSession({
      ...session,
      status: "paused",
      durationBeforeStartSeconds: elapsedSeconds(session, now),
      startedAt: null,
      lastPoint: null,
    });
    setGeoMessage("Recording paused.");
  }

  function resumeSession() {
    if (!session) return;
    setSession({ ...session, status: "running", startedAt: Date.now(), lastPoint: null });
    setClock(Date.now());
    startGpsTracking();
  }

  function finishSession() {
    if (!session) return;
    stopGps();
    const durationSeconds = elapsedSeconds(session, Date.now());
    const distanceKm = session.distanceMeters / 1000;
    if (distanceKm < 0.01) {
      setSavingError("No distance was recorded. Wait for a GPS fix before finishing.");
      setSession({ ...session, status: "paused", durationBeforeStartSeconds: durationSeconds, startedAt: null, lastPoint: null });
      return;
    }
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      kind: session.kind,
      distanceKm,
      durationSeconds,
      date: session.startedOn,
    };
    setActivities((current) => [entry, ...current]);
    setSession(null);
    setGeoMessage("Activity saved.");
  }

  function removeActivity(id: string) {
    setActivities((current) => current.filter((entry) => entry.id !== id));
  }

  return (
    <section className="activity-section" aria-label="Activity tracking">
      <header className="activity-heading">
        <div><p className="activity-eyebrow">Move at your pace</p><h2>Activity</h2><p>Record runs, walks, and cycling with GPS.</p></div>
      </header>

      <div className="activity-summary">
        <article><span><Footprints size={16} /> Running</span><strong>{distanceFor("Run").toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>km</small></strong></article>
        <article><span><Footprints size={16} /> Walking</span><strong>{distanceFor("Walk").toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>km</small></strong></article>
        <article><span><Bike size={16} /> Cycling</span><strong>{distanceFor("Cycle").toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>km</small></strong></article>
        <article><span><Route size={16} /> Total</span><strong>{totalDistance.toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>km</small></strong></article>
      </div>

      {session ? (
        <div className="activity-live-panel" aria-live="polite">
          <div className="activity-live-title">
            <span className={cn("activity-kind-icon", session.kind.toLowerCase())}>{activityIcon(session.kind)}</span>
            <div><strong>{activityLabel(session.kind)}</strong><small>{session.status === "running" ? "Recording" : "Paused"}</small></div>
            <span className={cn("activity-gps-status", session.status === "running" && "is-live")}><MapPin size={14} />{session.status === "running" ? "GPS on" : "GPS paused"}</span>
          </div>
          <div className="activity-live-metrics">
            <div><span>Distance</span><strong>{(session.distanceMeters / 1000).toFixed(2)} <small>km</small></strong></div>
            <div><span>Duration</span><strong>{formatDuration(liveDuration)}</strong></div>
            <div><span>Average pace</span><strong>{formatPace(liveDuration, session.distanceMeters / 1000)}</strong></div>
          </div>
          <div className="activity-live-actions">
            {session.status === "running"
              ? <button type="button" className="planit-secondary-button" onClick={pauseSession}><Pause size={15} /> Pause</button>
              : <button type="button" className="planit-primary-button" onClick={resumeSession}><Play size={15} /> Resume GPS</button>}
            <button type="button" className="activity-finish-button" onClick={finishSession}>Finish activity</button>
          </div>
        </div>
      ) : (
        <div className="activity-start-panel">
          <div className="activity-type-options" role="group" aria-label="Choose an activity">
            {ACTIVITY_TYPES.map((type) => (
              <button key={type} type="button" className={cn("activity-type-option", kind === type && "is-selected")} onClick={() => setKind(type)} aria-pressed={kind === type}>
                {activityIcon(type, 16)} {activityLabel(type)}
              </button>
            ))}
          </div>
          <button type="button" className="planit-primary-button activity-start-button" onClick={startSession}><MapPin size={16} /> Start GPS tracking</button>
        </div>
      )}

      {(geoMessage || savingError) && <p className={cn("activity-message", savingError && "has-error")} role="status">{savingError || geoMessage}</p>}

      <section className="activity-history" aria-label="Activity history">
        <div className="activity-history-heading"><h3>Activity log</h3><span>{orderedActivities.length} activities</span></div>
        <div className="activity-table-scroll">
          <table className="activity-table">
            <thead><tr><th scope="col">Activity</th><th scope="col">Date</th><th scope="col">Distance</th><th scope="col">Duration</th><th scope="col">Avg. pace</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {orderedActivities.map((entry) => (
                <tr key={entry.id}>
                  <td><span className="activity-table-kind"><span className={cn("activity-kind-icon", entry.kind.toLowerCase())}>{activityIcon(entry.kind, 15)}</span>{activityLabel(entry.kind)}</span></td>
                  <td>{new Date(`${entry.date}T12:00:00`).toLocaleDateString()}</td>
                  <td>{entry.distanceKm.toLocaleString("en-IN", { maximumFractionDigits: 2 })} km</td>
                  <td>{formatDuration(entry.durationSeconds)}</td>
                  <td>{formatPace(entry.durationSeconds, entry.distanceKm)}</td>
                  <td><button type="button" onClick={() => removeActivity(entry.id)} aria-label={`Delete ${activityLabel(entry.kind)} on ${entry.date}`} title="Delete"><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {!orderedActivities.length && <tr><td className="activity-table-empty" colSpan={6}>No activities yet. Start GPS tracking to record one.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

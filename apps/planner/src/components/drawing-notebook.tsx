"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, Check, Circle, Copy, Diamond, Download, Eraser, FileText, Hand, Highlighter,
  ImagePlus, ListChecks, Maximize2, Minimize2, Minus, Moon, MousePointer2, NotebookPen,
  PenLine, Plus, Redo2, RotateCcw, Search, Square, StickyNote, Sun, Trash2, Type, Undo2, Upload,
  X, ZoomIn, ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/cn";

type BoardKind = "white" | "black";
type BoardTool = "pen" | "highlighter" | "eraser" | "line" | "arrow" | "rectangle" | "ellipse" | "diamond" | "text" | "sticky" | "checklist" | "sticker" | "select" | "hand";
type PaperStyle = "plain" | "dots" | "lines" | "squares" | "cornell";
type InkPoint = { x: number; y: number; pressure?: number };
type StrokeItem = { id: string; kind: "stroke"; shape: "freehand" | "line" | "arrow" | "rectangle" | "ellipse" | "diamond"; points: InkPoint[]; color: string; width: number; opacity: number; fill: string; dash: "solid" | "dashed" | "dotted"; highlighter?: boolean };
type NoteItem = { id: string; kind: "note"; type: "text" | "sticky" | "checklist"; x: number; y: number; width: number; height: number; value: string; color: string; fill: string; size: number; bold?: boolean; checked?: boolean[] };
type StickerItem = { id: string; kind: "sticker"; x: number; y: number; value: string; size: number };
type ImageItem = { id: string; kind: "image"; x: number; y: number; width: number; height: number; src: string; name: string };
type BoardItem = StrokeItem | NoteItem | StickerItem | ImageItem;
type NotebookAttachment = { id: string; name: string; mimeType: string; size: number; blob: Blob };
type NotebookPage = {
  id: string; title: string; boardKind: BoardKind; items: BoardItem[]; paperStyle: PaperStyle;
  penColor: string; penSize: number; eraserSize: number; fillColor: string; opacity: number;
  attachments: NotebookAttachment[];
};
type NotebookProps = { storageScope: string; bookId: string; title: string; legacyDateKey?: string; compactControls?: boolean; notebookMode?: boolean; paperColor?: string };
type StoredBook = { id: string; pages: NotebookPage[] };
type Point = { x: number; y: number };
type Selection = { kind: BoardItem["kind"]; id: string };
type TextDraft = { x: number; y: number; value: string; type: NoteItem["type"]; editId?: string };
type Viewport = { zoom: number; x: number; y: number };
type DragState = { pointerId: number; kind: "draw" | "move" | "resize" | "pan" | "erase"; pageId: string; origin: Point; itemId?: string; startView?: Viewport; lastPoint?: Point; erasedIds?: Set<string>; handle?: "nw" | "ne" | "sw" | "se"; bounds?: { x: number; y: number; width: number; height: number } };
type History = { past: BoardItem[][]; future: BoardItem[][]; lastCommit?: number; lastCommitKey?: string };

const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 780;
const WHITE_INKS = ["#17191f", "#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c"];
const CHALK_INKS = ["#f8fafc", "#fde047", "#f9a8d4", "#67e8f9", "#86efac", "#fdba74"];
const FILLS = ["transparent", "#fecaca", "#bbf7d0", "#bfdbfe", "#fde68a", "#ddd6fe"];
const DARK_FILLS = ["transparent", "#7f1d1d", "#14532d", "#1e3a8a", "#713f12", "#4c1d95"];
const STICKERS = ["⭐", "❤️", "✨", "🌈", "🚀", "🎯", "🔥", "☀️", "🌙", "🌸", "🍀", "🎉", "🏆", "🐱", "🐶", "📍", "💡", "🎨", "⚡", "🎵", "🌿", "☕", "🌻", "🪴", "🧠", "📚", "✅"];
const TOOL_OPTIONS: { id: BoardTool; label: string; icon: typeof PenLine; shortcut?: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "hand", label: "Pan", icon: Hand, shortcut: "H" },
  { id: "pen", label: "Pen", icon: PenLine, shortcut: "P" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, shortcut: "I" },
  { id: "eraser", label: "Eraser", icon: Eraser, shortcut: "E" },
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "diamond", label: "Diamond", icon: Diamond },
  { id: "text", label: "Text", icon: Type },
  { id: "sticky", label: "Sticky note", icon: StickyNote },
  { id: "checklist", label: "Checklist", icon: ListChecks },
  { id: "sticker", label: "Sticker", icon: NotebookPen },
];

let databasePromise: Promise<IDBDatabase> | null = null;

function openNotebookDatabase() {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open("planit-notebooks", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("books")) request.result.createObjectStore("books", { keyPath: "id" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); databasePromise = null; }; resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
  databasePromise = opening.catch((error) => { databasePromise = null; throw error; });
  return databasePromise;
}

async function getStoredBook(id: string): Promise<NotebookPage[] | null> {
  const database = await openNotebookDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction("books", "readonly").objectStore("books").get(id);
    request.onsuccess = () => resolve((request.result as StoredBook | undefined)?.pages ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredBook(id: string, pages: NotebookPage[]) {
  const database = await openNotebookDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("books", "readwrite");
    transaction.objectStore("books").put({ id, pages } satisfies StoredBook);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function isDarkPaper(color: string) {
  const value = color.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(value)) return false;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 < 0.25;
}

function makePage(title: string, boardKind: BoardKind = "white"): NotebookPage {
  return { id: crypto.randomUUID(), title, boardKind, items: [], paperStyle: "plain", penColor: boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0], penSize: 3.5, eraserSize: 30, fillColor: "transparent", opacity: 100, attachments: [] };
}

function normalizeItem(value: unknown): BoardItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<BoardItem>;
  if (typeof item.id !== "string") return null;
  if (item.kind === "stroke") {
    const stroke = item as Partial<StrokeItem>;
    const shapes: StrokeItem["shape"][] = ["freehand", "line", "arrow", "rectangle", "ellipse", "diamond"];
    if (!shapes.includes(stroke.shape as StrokeItem["shape"]) || !Array.isArray(stroke.points) || !stroke.points.length || typeof stroke.color !== "string") return null;
    const points = stroke.points.filter((point): point is InkPoint => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)));
    if (!points.length) return null;
    return { id: stroke.id!, kind: "stroke", shape: stroke.shape!, points, color: stroke.color, width: Number.isFinite(stroke.width) ? clamp(Number(stroke.width), 0.5, 64) : 3, opacity: Number.isFinite(stroke.opacity) ? clamp(Number(stroke.opacity), 0, 100) : 100, fill: typeof stroke.fill === "string" ? stroke.fill : "transparent", dash: stroke.dash === "dashed" || stroke.dash === "dotted" ? stroke.dash : "solid", highlighter: stroke.highlighter === true };
  }
  if (item.kind === "note") {
    const note = item as Partial<NoteItem>;
    if (!(note.type === "text" || note.type === "sticky" || note.type === "checklist") || ![note.x, note.y, note.width, note.height, note.size].every(Number.isFinite) || typeof note.value !== "string") return null;
    return { id: note.id!, kind: "note", type: note.type, x: Number(note.x), y: Number(note.y), width: clamp(Number(note.width), 24, 2400), height: clamp(Number(note.height), 24, 2400), value: note.value.slice(0, 1500), color: typeof note.color === "string" ? note.color : "#17191f", fill: typeof note.fill === "string" ? note.fill : "transparent", size: clamp(Number(note.size), 10, 128), bold: note.bold === true, checked: Array.isArray(note.checked) ? note.checked.map((value) => value === true).slice(0, 1500) : undefined };
  }
  if (item.kind === "sticker") {
    const sticker = item as Partial<StickerItem>;
    if (![sticker.x, sticker.y, sticker.size].every(Number.isFinite) || typeof sticker.value !== "string") return null;
    return { id: sticker.id!, kind: "sticker", x: Number(sticker.x), y: Number(sticker.y), size: clamp(Number(sticker.size), 10, 256), value: sticker.value.slice(0, 8) };
  }
  if (item.kind === "image") {
    const image = item as Partial<ImageItem>;
    if (![image.x, image.y, image.width, image.height].every(Number.isFinite) || typeof image.src !== "string" || !/^data:image\/(png|jpe?g|webp|gif|avif|bmp);base64,/i.test(image.src)) return null;
    return { id: image.id!, kind: "image", x: Number(image.x), y: Number(image.y), width: clamp(Number(image.width), 1, 2400), height: clamp(Number(image.height), 1, 2400), src: image.src, name: typeof image.name === "string" ? image.name.slice(0, 180) : "Image" };
  }
  return null;
}

function normalizePage(value: unknown): NotebookPage | null {
  if (!value || typeof value !== "object") return null;
  const page = value as Partial<NotebookPage> & { strokes?: unknown[]; texts?: unknown[]; stickers?: unknown[] };
  if (typeof page.id !== "string" || typeof page.title !== "string" || (page.boardKind !== "white" && page.boardKind !== "black")) return null;
  const items: BoardItem[] = Array.isArray(page.items) ? page.items.flatMap((item) => { const normalized = normalizeItem(item); return normalized ? [normalized] : []; }) : [];
  // Read the older board format so its pages and marks remain usable after the upgrade.
  for (const value of page.strokes ?? []) {
    if (!value || typeof value !== "object") continue;
    const stroke = value as { id?: string; points?: InkPoint[]; color?: string; width?: number; shape?: string; erase?: boolean };
    if (!Array.isArray(stroke.points) || !stroke.points.length || typeof stroke.color !== "string") continue;
    items.push({ id: stroke.id ?? crypto.randomUUID(), kind: "stroke", shape: stroke.shape === "line" ? "line" : stroke.shape === "rectangle" ? "rectangle" : "freehand", points: stroke.points, color: stroke.color, width: Number(stroke.width) || 3, opacity: 100, fill: "transparent", dash: "solid" });
  }
  for (const value of page.texts ?? []) {
    if (!value || typeof value !== "object") continue;
    const text = value as { id?: string; x?: number; y?: number; value?: string; color?: string; size?: number; bold?: boolean };
    if (!Number.isFinite(text.x) || !Number.isFinite(text.y) || typeof text.value !== "string") continue;
    items.push({ id: text.id ?? crypto.randomUUID(), kind: "note", type: "text", x: text.x!, y: text.y!, width: 300, height: 110, value: text.value, color: text.color ?? "#17191f", fill: "transparent", size: Number(text.size) || 26, bold: text.bold });
  }
  for (const value of page.stickers ?? []) {
    if (!value || typeof value !== "object") continue;
    const sticker = value as { id?: string; x?: number; y?: number; value?: string; size?: number };
    if (!Number.isFinite(sticker.x) || !Number.isFinite(sticker.y) || typeof sticker.value !== "string") continue;
    items.push({ id: sticker.id ?? crypto.randomUUID(), kind: "sticker", x: sticker.x!, y: sticker.y!, value: sticker.value, size: Number(sticker.size) || 48 });
  }
  const attachments = Array.isArray(page.attachments) ? page.attachments.filter((attachment): attachment is NotebookAttachment => Boolean(attachment && typeof attachment === "object" && typeof (attachment as NotebookAttachment).id === "string" && (attachment as NotebookAttachment).blob instanceof Blob)) : [];
  return {
    id: page.id, title: page.title, boardKind: page.boardKind, items,
    paperStyle: ["plain", "dots", "lines", "squares", "cornell"].includes(String(page.paperStyle)) ? page.paperStyle as PaperStyle : "plain",
    penColor: typeof page.penColor === "string" ? page.penColor : page.boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0],
    penSize: Number.isFinite(page.penSize) ? clamp(Number(page.penSize), 1, 14) : 3.5, eraserSize: Number.isFinite(page.eraserSize) ? clamp(Number(page.eraserSize), 12, 80) : 30,
    fillColor: typeof page.fillColor === "string" ? page.fillColor : "transparent", opacity: Number.isFinite(page.opacity) ? clamp(Number(page.opacity), 0, 100) : 100, attachments,
  };
}

function NotebookFileLink({ attachment, onRemove }: { attachment: NotebookAttachment; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);
  return <div className="drawing-attachment-row"><FileText size={16} /><div><a href={url || undefined} download={attachment.name}>{attachment.name}</a><small>{(attachment.size / (1024 * 1024)).toFixed(1)} MB</small></div><button type="button" onClick={onRemove} aria-label={`Remove ${attachment.name}`} title="Remove file"><X size={15} /></button></div>;
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}
function pathFor(points: InkPoint[], shape: StrokeItem["shape"]) {
  if (!points.length) return "";
  const first = points[0]; const last = points[points.length - 1];
  if (shape === "line") return `M${first.x},${first.y} L${last.x},${last.y}`;
  if (shape === "arrow") {
    const angle = Math.atan2(last.y - first.y, last.x - first.x); const head = Math.min(24, Math.hypot(last.x - first.x, last.y - first.y) * 0.38);
    const a = { x: last.x - head * Math.cos(angle - Math.PI / 6), y: last.y - head * Math.sin(angle - Math.PI / 6) };
    const b = { x: last.x - head * Math.cos(angle + Math.PI / 6), y: last.y - head * Math.sin(angle + Math.PI / 6) };
    return `M${first.x},${first.y} L${last.x},${last.y} M${a.x},${a.y} L${last.x},${last.y} L${b.x},${b.y}`;
  }
  const left = Math.min(first.x, last.x); const right = Math.max(first.x, last.x); const top = Math.min(first.y, last.y); const bottom = Math.max(first.y, last.y);
  if (shape === "rectangle") return `M${left},${top} H${right} V${bottom} H${left} Z`;
  if (shape === "diamond") return `M${(left + right) / 2},${top} L${right},${(top + bottom) / 2} L${(left + right) / 2},${bottom} L${left},${(top + bottom) / 2} Z`;
  if (shape === "ellipse") { const rx = Math.max(0.1, (right - left) / 2); const ry = Math.max(0.1, (bottom - top) / 2); const cx = (left + right) / 2; const cy = (top + bottom) / 2; return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`; }
  if (points.length === 1) return `M${first.x},${first.y} L${first.x + 0.1},${first.y}`;
  if (points.length === 2) return `M${first.x},${first.y} L${last.x},${last.y}`;
  let path = `M${first.x},${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]; const next = points[index + 1];
    path += ` Q${point.x},${point.y} ${(point.x + next.x) / 2},${(point.y + next.y) / 2}`;
  }
  return `${path} L${last.x},${last.y}`;
}
function itemBounds(item: BoardItem): { x: number; y: number; width: number; height: number } {
  if (item.kind === "stroke") {
    let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
    for (const point of item.points) { left = Math.min(left, point.x); right = Math.max(right, point.x); top = Math.min(top, point.y); bottom = Math.max(bottom, point.y); }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  if (item.kind === "sticker") return { x: item.x - item.size / 2, y: item.y - item.size / 2, width: item.size, height: item.size };
  if (item.kind === "note" && item.type === "text") return { x: item.x, y: item.y - item.size, width: item.width, height: Math.max(item.height, item.value.split("\n").length * item.size * 1.3) };
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}
function hitItem(point: Point, item: BoardItem, tolerance = 0) {
  const bounds = itemBounds(item); const padding = item.kind === "stroke" ? Math.max(10, item.width + 6) + tolerance : 6 + tolerance;
  if (point.x < bounds.x - padding || point.x > bounds.x + bounds.width + padding || point.y < bounds.y - padding || point.y > bounds.y + bounds.height + padding) return false;
  if (item.kind !== "stroke") return true;
  const nearSegment = (a: Point, b: Point) => distanceToSegment(point, a, b) <= padding;
  const first = item.points[0]; const last = item.points[item.points.length - 1];
  if (item.shape === "freehand") return item.points.some((candidate, index) => index === 0 ? Math.hypot(point.x - candidate.x, point.y - candidate.y) < padding : nearSegment(item.points[index - 1], candidate));
  if (item.shape === "line") return nearSegment(first, last);
  if (item.shape === "arrow") {
    const angle = Math.atan2(last.y - first.y, last.x - first.x); const head = Math.min(24, Math.hypot(last.x - first.x, last.y - first.y) * 0.38);
    const a = { x: last.x - head * Math.cos(angle - Math.PI / 6), y: last.y - head * Math.sin(angle - Math.PI / 6) };
    const b = { x: last.x - head * Math.cos(angle + Math.PI / 6), y: last.y - head * Math.sin(angle + Math.PI / 6) };
    return nearSegment(first, last) || nearSegment(a, last) || nearSegment(last, b);
  }
  const left = bounds.x; const right = bounds.x + bounds.width; const top = bounds.y; const bottom = bounds.y + bounds.height;
  if (item.shape === "rectangle") {
    const inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    return (item.fill !== "transparent" && inside) || nearSegment({ x: left, y: top }, { x: right, y: top }) || nearSegment({ x: right, y: top }, { x: right, y: bottom }) || nearSegment({ x: right, y: bottom }, { x: left, y: bottom }) || nearSegment({ x: left, y: bottom }, { x: left, y: top });
  }
  if (item.shape === "diamond") {
    const midX = (left + right) / 2; const midY = (top + bottom) / 2;
    const inside = Math.abs(point.x - midX) / Math.max(1, bounds.width / 2) + Math.abs(point.y - midY) / Math.max(1, bounds.height / 2) <= 1;
    return (item.fill !== "transparent" && inside) || nearSegment({ x: midX, y: top }, { x: right, y: midY }) || nearSegment({ x: right, y: midY }, { x: midX, y: bottom }) || nearSegment({ x: midX, y: bottom }, { x: left, y: midY }) || nearSegment({ x: left, y: midY }, { x: midX, y: top });
  }
  const rx = Math.max(1, bounds.width / 2); const ry = Math.max(1, bounds.height / 2); const normalized = Math.hypot((point.x - (left + rx)) / rx, (point.y - (top + ry)) / ry);
  return (item.fill !== "transparent" && normalized <= 1) || Math.abs(normalized - 1) * Math.min(rx, ry) <= padding;
}
function moveItem(item: BoardItem, dx: number, dy: number): BoardItem {
  if (item.kind === "stroke") return { ...item, points: item.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) };
  return { ...item, x: item.x + dx, y: item.y + dy };
}
function resizeItem(item: BoardItem, handle: NonNullable<DragState["handle"]>, bounds: NonNullable<DragState["bounds"]>, delta: Point): BoardItem {
  const minSize = 24;
  const right = bounds.x + bounds.width; const bottom = bounds.y + bounds.height;
  const left = handle.includes("w") ? Math.min(bounds.x + delta.x, right - minSize) : bounds.x;
  const nextRight = handle.includes("e") ? Math.max(right + delta.x, bounds.x + minSize) : right;
  const top = handle.includes("n") ? Math.min(bounds.y + delta.y, bottom - minSize) : bounds.y;
  const nextBottom = handle.includes("s") ? Math.max(bottom + delta.y, bounds.y + minSize) : bottom;
  const x = left; const y = top; const width = Math.max(minSize, nextRight - left); const height = Math.max(minSize, nextBottom - top);
  if (item.kind === "stroke") return { ...item, points: item.points.map((point) => ({ ...point, x: x + (point.x - bounds.x) / Math.max(1, bounds.width) * width, y: y + (point.y - bounds.y) / Math.max(1, bounds.height) * height })) };
  if (item.kind === "sticker") return { ...item, x: x + width / 2, y: y + height / 2, size: Math.max(18, Math.max(width, height)) };
  if (item.kind === "note" && item.type === "text") { const size = Math.max(10, item.size * Math.min(width / Math.max(1, bounds.width), height / Math.max(1, bounds.height))); return { ...item, x, y: y + size, width, height, size }; }
  return { ...item, x, y, width, height };
}
function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}

export function DrawingNotebook({ storageScope, bookId, title, legacyDateKey, compactControls = false, notebookMode = false, paperColor }: NotebookProps) {
  const storageKey = `planit-notebook-v1:${encodeURIComponent(storageScope)}:${encodeURIComponent(bookId)}`;
  const defaultBoardKind: BoardKind = paperColor && isDarkPaper(paperColor) ? "black" : "white";
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [loadedBookKey, setLoadedBookKey] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState("");
  const [tool, setTool] = useState<BoardTool>("pen");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StrokeItem | null>(null);
  const [erasedItemIds, setErasedItemIds] = useState<string[]>([]);
  const [dragDelta, setDragDelta] = useState<Point>({ x: 0, y: 0 });
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [textBold, setTextBold] = useState(false);
  const [sticker, setSticker] = useState(STICKERS[0]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });
  const [attachmentError, setAttachmentError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const pagesRef = useRef(pages);
  const boardRootRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draftRef = useRef<StrokeItem | null>(null);
  const historyRef = useRef(new Map<string, History>());
  const clipboardRef = useRef<BoardItem | null>(null);
  const spacePressedRef = useRef(false);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { if (textDraft) textInputRef.current?.focus(); }, [textDraft]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      let nextPages: NotebookPage[] = [];
      try { const stored = await getStoredBook(storageKey); nextPages = stored?.length ? stored.flatMap((page) => { const normalized = normalizePage(page); return normalized ? [normalized] : []; }) : []; } catch { /* Fall back to the browser's local storage copy. */ }
      if (!nextPages.length) {
        try {
          const local = window.localStorage.getItem(storageKey);
          if (local) { const parsed = JSON.parse(local) as unknown; if (Array.isArray(parsed)) nextPages = parsed.flatMap((page) => { const normalized = normalizePage(page); return normalized ? [normalized] : []; }); }
        } catch { /* Use the legacy copy or start with a blank page. */ }
      }
      if (!nextPages.length && legacyDateKey) {
        const scopeKey = encodeURIComponent(storageScope);
        try {
          const oldWhite = window.localStorage.getItem(`planit-board-v2:${scopeKey}:${legacyDateKey}:white`);
          const oldBlack = window.localStorage.getItem(`planit-board-v2:${scopeKey}:${legacyDateKey}:black`);
          const legacy = [oldWhite, oldBlack].flatMap((source) => { if (!source) return []; const value = JSON.parse(source) as unknown; return Array.isArray(value) ? value : []; });
          if (legacy.length) { const page = makePage(title, defaultBoardKind); page.items = legacy.flatMap((item): BoardItem[] => { if (!item || typeof item !== "object") return []; const old = item as Partial<StrokeItem>; return Array.isArray(old.points) && typeof old.color === "string" ? [{ id: typeof old.id === "string" ? old.id : crypto.randomUUID(), kind: "stroke", shape: old.shape === "rectangle" ? "rectangle" : old.shape === "line" ? "line" : "freehand", points: old.points, color: old.color, width: Number(old.width) || 3, opacity: 100, fill: "transparent", dash: "solid" }] : []; }); nextPages = [page]; }
        } catch { /* Ignore invalid legacy data. */ }
      }
      if (!nextPages.length) nextPages = [makePage(title, defaultBoardKind)];
      try { await saveStoredBook(storageKey, nextPages); } catch { try { window.localStorage.setItem(storageKey, JSON.stringify(nextPages)); } catch { /* Keep the loaded page available even if storage is disabled. */ } }
      if (cancelled) return;
      pagesRef.current = nextPages; setPages(nextPages); setSelectedPageId(nextPages[0]?.id ?? null); setLoadedBookKey(storageKey);
    }
    setLoadedBookKey(null); void load();
    return () => { cancelled = true; };
  }, [defaultBoardKind, legacyDateKey, storageKey, storageScope, title]);

  useEffect(() => {
    if (loadedBookKey !== storageKey) return;
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveStoredBook(storageKey, pages).then(() => setSaveState("saved")).catch(() => {
        try { window.localStorage.setItem(storageKey, JSON.stringify(pages)); setSaveState(pages.some((page) => page.attachments.length > 0) ? "error" : "saved"); } catch { setSaveState("error"); }
      });
    }, 350);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [loadedBookKey, pages, storageKey]);

  useEffect(() => () => {
    if (!pagesRef.current.length) return;
    void saveStoredBook(storageKey, pagesRef.current).catch(() => {
      try { window.localStorage.setItem(storageKey, JSON.stringify(pagesRef.current)); } catch { /* Storage is unavailable. */ }
    });
  }, [storageKey]);

  const bookIsLoaded = loadedBookKey === storageKey;
  const visiblePages = bookIsLoaded ? pages : [];
  const pageTabs = notebookMode && pageSearch.trim() ? visiblePages.filter((page) => `${page.title}\n${page.items.filter((item): item is NoteItem => item.kind === "note").map((item) => item.value).join("\n")}\n${page.attachments.map((item) => item.name).join("\n")}`.toLowerCase().includes(pageSearch.trim().toLowerCase())) : visiblePages;
  const currentIndex = visiblePages.findIndex((page) => page.id === selectedPageId);
  const currentPage = currentIndex >= 0 ? visiblePages[currentIndex] : visiblePages[0];
  const selectedItem = currentPage?.items.find((item) => item.id === selectedId);
  const darkPaper = currentPage ? currentPage.boardKind === "black" : defaultBoardKind === "black";
  const colors = darkPaper ? CHALK_INKS : WHITE_INKS;
  const background = paperColor && currentPage?.boardKind === defaultBoardKind ? paperColor : darkPaper ? "#18231f" : "#ffffff";
  const sceneItems = useMemo(() => currentPage ? [...currentPage.items.filter((item) => !erasedItemIds.includes(item.id)), ...(draft ? [draft] : [])] : [], [currentPage, draft, erasedItemIds]);
  const activeTool = TOOL_OPTIONS.find((option) => option.id === tool);

  const replacePages = useCallback((update: (current: NotebookPage[]) => NotebookPage[]) => {
    const next = update(pagesRef.current); pagesRef.current = next; setPages(next);
  }, []);
  const updatePage = useCallback((pageId: string, patch: Partial<NotebookPage>) => {
    replacePages((existing) => existing.map((page) => page.id === pageId ? { ...page, ...patch } : page));
  }, [replacePages]);

  const commitItems = useCallback((nextItems: BoardItem[], page = currentPage, coalesceKey?: string) => {
    if (!page) return;
    const history = historyRef.current.get(page.id) ?? { past: [], future: [] };
    const now = Date.now(); const coalesce = Boolean(coalesceKey && history.lastCommitKey === coalesceKey && history.lastCommit && now - history.lastCommit < 500);
    if (!coalesce) history.past = [...history.past.slice(-99), page.items];
    history.future = []; history.lastCommit = now; history.lastCommitKey = coalesceKey;
    historyRef.current.set(page.id, history);
    updatePage(page.id, { items: nextItems });
  }, [currentPage, updatePage]);

  const undo = useCallback(() => {
    if (!currentPage) return;
    const history = historyRef.current.get(currentPage.id); if (!history?.past.length) return;
    const previous = history.past[history.past.length - 1]; history.past = history.past.slice(0, -1); history.future = [...history.future, currentPage.items];
    history.lastCommitKey = undefined; historyRef.current.set(currentPage.id, history); updatePage(currentPage.id, { items: previous }); setSelectedId(null);
  }, [currentPage, updatePage]);
  const redo = useCallback(() => {
    if (!currentPage) return;
    const history = historyRef.current.get(currentPage.id); if (!history?.future.length) return;
    const next = history.future[history.future.length - 1]; history.future = history.future.slice(0, -1); history.past = [...history.past, currentPage.items];
    history.lastCommitKey = undefined; historyRef.current.set(currentPage.id, history); updatePage(currentPage.id, { items: next }); setSelectedId(null);
  }, [currentPage, updatePage]);

  function addPage() {
    if (textDraft) saveTextDraft();
    const page = makePage(`Page ${pagesRef.current.length + 1}`, defaultBoardKind); replacePages((existing) => [...existing, page]); setSelectedPageId(page.id); setSelectedId(null); setTextDraft(null); dragRef.current = null; draftRef.current = null; setDraft(null); setErasedItemIds([]); setTool("pen"); setViewport({ zoom: 1, x: 0, y: 0 });
  }
  function deletePage() {
    if (!currentPage) return;
    setTextDraft(null); dragRef.current = null; draftRef.current = null; setDraft(null); setErasedItemIds([]);
    if (pages.length <= 1) { commitItems([]); updatePage(currentPage.id, { title: "Page 1", attachments: [] }); setSelectedId(null); return; }
    const next = pagesRef.current.filter((page) => page.id !== currentPage.id); replacePages(() => next); setSelectedPageId(next[Math.max(0, currentIndex - 1)]?.id ?? next[0]?.id ?? null); setSelectedId(null); setViewport({ zoom: 1, x: 0, y: 0 });
  }
  function setBoardKind(boardKind: BoardKind) {
    if (!currentPage) return;
    updatePage(currentPage.id, { boardKind, penColor: boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0] });
  }
  function pointFromClient(clientX: number, clientY: number, bounds: DOMRect, view = viewport): Point {
    const vx = (clientX - bounds.left) / bounds.width * BOARD_WIDTH;
    const vy = (clientY - bounds.top) / bounds.height * BOARD_HEIGHT;
    return { x: (vx - view.x) / view.zoom, y: (vy - view.y) / view.zoom };
  }
  function localPoint(event: React.PointerEvent<SVGSVGElement> | React.WheelEvent<SVGSVGElement>): Point {
    return pointFromClient(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }
  function collectErasedItems(drag: DragState, from: Point, to: Point, page: NotebookPage) {
    const tolerance = page.eraserSize / 2;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(4, tolerance * 0.45)));
    const previousSize = drag.erasedIds!.size;
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps; const sample = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      for (const item of [...page.items].reverse()) if (!drag.erasedIds!.has(item.id) && hitItem(sample, item, tolerance)) drag.erasedIds!.add(item.id);
    }
    if (drag.erasedIds!.size !== previousSize) setErasedItemIds([...drag.erasedIds!]);
  }

  function startPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!currentPage || !bookIsLoaded || (event.button !== 0 && event.button !== 1)) return;
    event.currentTarget.focus({ preventScroll: true });
    const point = localPoint(event);
    if (tool === "hand" || event.button === 1 || spacePressedRef.current) {
      dragRef.current = { pointerId: event.pointerId, kind: "pan", pageId: currentPage.id, origin: { x: event.clientX, y: event.clientY }, startView: viewport };
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const handle = (event.target as SVGElement).closest<SVGElement>("[data-resize-handle]")?.dataset.resizeHandle as DragState["handle"] | undefined;
    if (tool === "select" && handle && selectedItem) {
      dragRef.current = { pointerId: event.pointerId, kind: "resize", pageId: currentPage.id, origin: point, itemId: selectedItem.id, handle, bounds: itemBounds(selectedItem) }; setDragDelta({ x: 0, y: 0 });
      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    if (tool === "select") {
      const target = (event.target as SVGElement).closest<SVGElement>("[data-board-id]"); const id = target?.dataset.boardId;
      if (!id) { setSelectedId(null); return; }
      const item = currentPage.items.find((candidate) => candidate.id === id); if (!item) return;
      setSelectedId(id); dragRef.current = { pointerId: event.pointerId, kind: "move", pageId: currentPage.id, origin: point, itemId: id }; setDragDelta({ x: 0, y: 0 }); event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    if (tool === "text" || tool === "sticky" || tool === "checklist") {
      if (textDraft) { saveTextDraft(); return; }
      setTextDraft({ x: point.x, y: point.y, value: "", type: tool === "sticky" ? "sticky" : tool === "checklist" ? "checklist" : "text" }); setTextBold(false); return;
    }
    if (tool === "sticker") { commitItems([...currentPage.items, { id: crypto.randomUUID(), kind: "sticker", x: point.x, y: point.y, value: sticker, size: 48 }]); return; }
    if (tool === "eraser") {
      const drag: DragState = { pointerId: event.pointerId, kind: "erase", pageId: currentPage.id, origin: point, lastPoint: point, erasedIds: new Set() };
      dragRef.current = drag; collectErasedItems(drag, point, point, currentPage); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    const shape: StrokeItem["shape"] = tool === "line" ? "line" : tool === "arrow" ? "arrow" : tool === "rectangle" ? "rectangle" : tool === "ellipse" ? "ellipse" : tool === "diamond" ? "diamond" : "freehand";
    const highlighter = tool === "highlighter";
    const item: StrokeItem = { id: crypto.randomUUID(), kind: "stroke", shape, points: [{ ...point, pressure: event.pressure || 0.5 }], color: currentPage.penColor, width: currentPage.penSize * (highlighter ? 3 : 1), opacity: highlighter ? 28 : currentPage.opacity, fill: shape !== "freehand" && shape !== "line" && shape !== "arrow" ? currentPage.fillColor : "transparent", dash: "solid", highlighter };
    dragRef.current = { pointerId: event.pointerId, kind: "draw", pageId: currentPage.id, origin: point, itemId: item.id }; draftRef.current = item; setDraft(item); setSelectedId(null); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }

  function movePointer(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "pan") { const bounds = event.currentTarget.getBoundingClientRect(); setViewport({ zoom: drag.startView?.zoom ?? viewport.zoom, x: (drag.startView?.x ?? 0) + (event.clientX - drag.origin.x) / bounds.width * BOARD_WIDTH, y: (drag.startView?.y ?? 0) + (event.clientY - drag.origin.y) / bounds.height * BOARD_HEIGHT }); return; }
    const page = pagesRef.current.find((item) => item.id === drag.pageId); if (!page) return;
    const point = localPoint(event);
    if (drag.kind === "draw") {
      const native = event.nativeEvent;
      const samples = native.getCoalescedEvents?.() ?? [];
      const bounds = event.currentTarget.getBoundingClientRect();
      const view = viewport;
      const points = samples.length ? samples.map((sample) => ({ ...pointFromClient(sample.clientX, sample.clientY, bounds, view), pressure: sample.pressure || 0.5 })).filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y)) : [{ ...point, pressure: event.pressure || 0.5 }];
      const old = draftRef.current;
      if (old) { const next = { ...old, points: old.shape === "freehand" ? [...old.points, ...points] : [drag.origin as InkPoint, points[points.length - 1] ?? point] }; draftRef.current = next; setDraft(next); }
      return;
    }
    if (drag.kind === "move" || drag.kind === "resize") { setDragDelta({ x: point.x - drag.origin.x, y: point.y - drag.origin.y }); return; }
    if (drag.kind === "erase") { collectErasedItems(drag, drag.lastPoint ?? point, point, page); drag.lastPoint = point; }
  }

  function finishPointer(event?: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current; if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    const page = pagesRef.current.find((item) => item.id === drag.pageId);
    let finalDelta = dragDelta;
    if (event && (drag.kind === "move" || drag.kind === "resize")) { const point = localPoint(event); finalDelta = { x: point.x - drag.origin.x, y: point.y - drag.origin.y }; }
    if (event && drag.kind === "pan") { const bounds = event.currentTarget.getBoundingClientRect(); setViewport({ zoom: drag.startView?.zoom ?? viewport.zoom, x: (drag.startView?.x ?? 0) + (event.clientX - drag.origin.x) / bounds.width * BOARD_WIDTH, y: (drag.startView?.y ?? 0) + (event.clientY - drag.origin.y) / bounds.height * BOARD_HEIGHT }); }
    if (drag.kind === "draw" && draftRef.current && page) {
      let completed = draftRef.current;
      if (event) {
        const point = localPoint(event); const last = completed.points[completed.points.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) > 0.25) completed = { ...completed, points: completed.shape === "freehand" ? [...completed.points, { ...point, pressure: event.pressure || 0.5 }] : [drag.origin as InkPoint, { ...point, pressure: event.pressure || 0.5 }] };
      }
      commitItems([...page.items, completed], page);
    }
    if (drag.kind === "move" && page && drag.itemId && (finalDelta.x || finalDelta.y)) commitItems(page.items.map((item) => item.id === drag.itemId ? moveItem(item, finalDelta.x, finalDelta.y) : item), page);
    if (drag.kind === "resize" && page && drag.itemId && drag.handle && drag.bounds && (finalDelta.x || finalDelta.y)) commitItems(page.items.map((item) => item.id === drag.itemId ? resizeItem(item, drag.handle!, drag.bounds!, finalDelta) : item), page);
    if (drag.kind === "erase" && page && drag.erasedIds?.size) commitItems(page.items.filter((item) => !drag.erasedIds!.has(item.id)), page);
    dragRef.current = null; draftRef.current = null; setDraft(null); setErasedItemIds([]); setDragDelta({ x: 0, y: 0 });
  }

  function saveTextDraft() {
    const current = textDraft; if (!current || !currentPage) return;
    if (current.editId) {
      const item = currentPage.items.find((candidate) => candidate.id === current.editId);
      if (item?.kind === "note") {
        const lines = current.value.split("\n");
        const updated = { ...item, value: current.value, bold: textBold, height: item.type === "checklist" ? Math.max(210, 40 + lines.length * 28) : item.height, checked: item.type === "checklist" ? lines.map((_, index) => item.checked?.[index] ?? false) : item.checked };
        commitItems(currentPage.items.map((candidate) => candidate.id === current.editId ? updated : candidate));
      }
    } else if (current.value.trim()) {
      const checklistHeight = Math.max(210, 40 + current.value.split("\n").length * 28);
      const note: NoteItem = { id: crypto.randomUUID(), kind: "note", type: current.type, x: current.x, y: current.y, width: current.type === "text" ? 360 : 300, height: current.type === "checklist" ? checklistHeight : current.type === "sticky" ? 230 : 140, value: current.value, color: currentPage.penColor, fill: current.type === "sticky" ? (darkPaper ? "#574516" : "#fff1a8") : current.type === "checklist" ? (darkPaper ? "#21332b" : "#f3f8f1") : "transparent", size: current.type === "text" ? 26 : 20, bold: textBold, checked: current.type === "checklist" ? current.value.split("\n").map(() => false) : undefined };
      commitItems([...currentPage.items, note]); setSelectedId(note.id);
    }
    setTextDraft(null);
  }
  function editNote(item: NoteItem) { setTextBold(Boolean(item.bold)); setTextDraft({ x: item.x, y: item.y, value: item.value, type: item.type, editId: item.id }); }

  function deleteSelected() { if (!currentPage || !selectedId) return; commitItems(currentPage.items.filter((item) => item.id !== selectedId)); setSelectedId(null); }
  function duplicateSelected() { if (!currentPage || !selectedItem) return; const copy = { ...moveItem(selectedItem, 30, 24), id: crypto.randomUUID() } as BoardItem; clipboardRef.current = copy; commitItems([...currentPage.items, copy]); setSelectedId(copy.id); }
  function arrangeSelected(direction: "front" | "back") {
    if (!currentPage || !selectedId) return;
    const items = [...currentPage.items]; const index = items.findIndex((item) => item.id === selectedId); if (index < 0) return;
    const target = direction === "front" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    if (target === index) return;
    [items[index], items[target]] = [items[target], items[index]]; commitItems(items);
  }
  function setInkColor(color: string) {
    if (!currentPage) return;
    if (selectedItem?.kind === "stroke" || selectedItem?.kind === "note") commitItems(currentPage.items.map((item) => item.id === selectedItem.id ? { ...item, color } : item));
    else updatePage(currentPage.id, { penColor: color });
  }
  function setFillColor(fill: string) {
    if (!currentPage) return;
    if (selectedItem?.kind === "stroke" && selectedItem.shape !== "line" && selectedItem.shape !== "arrow" && selectedItem.shape !== "freehand") commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "stroke" ? { ...item, fill } : item));
    else if (selectedItem?.kind === "note" && selectedItem.type === "sticky") commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "note" ? { ...item, fill } : item));
    else updatePage(currentPage.id, { fillColor: fill });
  }
  function setStrokeWidth(width: number) {
    if (!currentPage) return;
    if (selectedItem?.kind === "stroke") commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "stroke" ? { ...item, width } : item), currentPage, `width:${selectedItem.id}`);
    else if (selectedItem?.kind === "note") commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "note" ? { ...item, size: width * 5 } : item), currentPage, `size:${selectedItem.id}`);
    else updatePage(currentPage.id, { penSize: width });
  }
  function setOpacity(opacity: number) {
    if (!currentPage) return;
    if (selectedItem?.kind === "stroke") commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "stroke" ? { ...item, opacity } : item), currentPage, `opacity:${selectedItem.id}`);
    else updatePage(currentPage.id, { opacity });
  }
  function setLineStyle(dash: StrokeItem["dash"]) {
    if (!currentPage || selectedItem?.kind !== "stroke") return;
    commitItems(currentPage.items.map((item) => item.id === selectedItem.id && item.kind === "stroke" ? { ...item, dash } : item));
  }

  function zoomBy(factor: number, anchor?: Point) {
    setViewport((current) => { const zoom = clamp(current.zoom * factor, 0.25, 3); if (!anchor) return { ...current, zoom }; const ratio = zoom / current.zoom; return { zoom, x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio }; });
  }
  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) { const bounds = event.currentTarget.getBoundingClientRect(); const anchor = { x: (event.clientX - bounds.left) / bounds.width * BOARD_WIDTH, y: (event.clientY - bounds.top) / bounds.height * BOARD_HEIGHT }; zoomBy(event.deltaY < 0 ? 1.08 : 0.92, anchor); }
    else { const bounds = event.currentTarget.getBoundingClientRect(); const dx = event.deltaX / bounds.width * BOARD_WIDTH; const dy = event.deltaY / bounds.height * BOARD_HEIGHT; setViewport((value) => ({ ...value, x: value.x - dx, y: value.y - dy })); }
  }

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null; if (!boardRootRef.current?.contains(target)) return;
    if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
    if (target?.closest("button, a, summary, [role='button']")) return;
    if (event.code === "Space" && !target?.closest("button, a, [role='button']")) { spacePressedRef.current = true; event.preventDefault(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedItem) { event.preventDefault(); clipboardRef.current = selectedItem; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && currentPage && clipboardRef.current) { event.preventDefault(); const copy = { ...moveItem(clipboardRef.current, 28, 28), id: crypto.randomUUID() } as BoardItem; clipboardRef.current = copy; commitItems([...currentPage.items, copy]); setSelectedId(copy.id); }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); deleteSelected(); }
    const shortcut = TOOL_OPTIONS.find((item) => item.shortcut?.toLowerCase() === event.key.toLowerCase()); if (!event.ctrlKey && !event.metaKey && shortcut) setTool(shortcut.id);
    if (event.key === "Escape") { dragRef.current = null; draftRef.current = null; setDraft(null); setErasedItemIds([]); setDragDelta({ x: 0, y: 0 }); setTextDraft(null); setSelectedId(null); setTool("select"); setIsFullscreen(false); }
  }, [commitItems, currentPage, deleteSelected, redo, selectedId, selectedItem, undo]);
  useEffect(() => { window.addEventListener("keydown", handleKeyDown); const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") spacePressedRef.current = false; }; window.addEventListener("keyup", keyUp); return () => { window.removeEventListener("keydown", handleKeyDown); window.removeEventListener("keyup", keyUp); }; }, [handleKeyDown]);

  function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (!currentPage || !files.length) return;
    const allowed = /\.(pdf|doc|docx|odt|rtf|txt)$/i; const invalid = files.find((file) => !allowed.test(file.name));
    if (invalid) { setAttachmentError(`${invalid.name} is not supported. Choose a PDF or document file.`); return; }
    const tooLarge = files.find((file) => file.size > 50 * 1024 * 1024); if (tooLarge) { setAttachmentError(`${tooLarge.name} is larger than the 50 MB per-file limit.`); return; }
    setAttachmentError(""); updatePage(currentPage.id, { attachments: [...currentPage.attachments, ...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, size: file.size, blob: file }))] });
  }
  async function addImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (!currentPage || !files.length) return;
    const additions: ImageItem[] = [];
    for (const file of files) {
      if (!/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.type) || file.size > 15 * 1024 * 1024) { setAttachmentError(`${file.name} must be a PNG, JPEG, WebP, GIF, AVIF, or BMP image smaller than 15 MB.`); continue; }
      try { const src = await readDataUrl(file); const image = new Image(); image.src = src; await image.decode(); const scale = Math.min(1, 420 / Math.max(image.naturalWidth, image.naturalHeight)); additions.push({ id: crypto.randomUUID(), kind: "image", x: 390 + additions.length * 24, y: 220 + additions.length * 24, width: image.naturalWidth * scale, height: image.naturalHeight * scale, src, name: file.name }); } catch { setAttachmentError(`${file.name} could not be added.`); }
    }
    if (additions.length) { setAttachmentError(""); commitItems([...currentPage.items, ...additions]); }
  }

  function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function serializeBoardSvg() {
    if (!svgRef.current) return null;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement; clone.setAttribute("width", String(BOARD_WIDTH * 2)); clone.setAttribute("height", String(BOARD_HEIGHT * 2)); clone.style.background = background;
    clone.querySelectorAll("[data-export-ui]").forEach((element) => element.remove());
    clone.querySelector(".native-board-world")?.setAttribute("transform", "translate(0 0) scale(1)");
    return new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  }
  function exportBoard(format: "svg" | "png" | "json") {
    if (!currentPage) return;
    const fileBase = (currentPage.title || title || "board").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    if (format === "json") { download(`${fileBase}.board.json`, new Blob([JSON.stringify({ title: currentPage.title, boardKind: currentPage.boardKind, paperStyle: currentPage.paperStyle, penColor: currentPage.penColor, penSize: currentPage.penSize, eraserSize: currentPage.eraserSize, fillColor: currentPage.fillColor, opacity: currentPage.opacity, items: currentPage.items }, null, 2)], { type: "application/json" })); return; }
    const svgBlob = serializeBoardSvg(); if (!svgBlob) return;
    if (format === "svg") { download(`${fileBase}.svg`, svgBlob); return; }
    const url = URL.createObjectURL(svgBlob); const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); canvas.width = BOARD_WIDTH * 2; canvas.height = BOARD_HEIGHT * 2; const context = canvas.getContext("2d"); context?.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.toBlob((blob) => { if (blob) download(`${fileBase}.png`, blob); URL.revokeObjectURL(url); }); }; image.onerror = () => URL.revokeObjectURL(url); image.src = url;
  }
  async function importBoard(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file || !currentPage) return;
    try { const parsed = JSON.parse(await file.text()) as Partial<NotebookPage>; const imported = normalizePage({ ...parsed, id: currentPage.id, title: currentPage.title, boardKind: currentPage.boardKind, attachments: currentPage.attachments }); if (!imported) throw new Error(); commitItems(imported.items); updatePage(currentPage.id, { paperStyle: imported.paperStyle, penColor: imported.penColor, penSize: imported.penSize, eraserSize: imported.eraserSize, fillColor: imported.fillColor, opacity: imported.opacity }); setAttachmentError(""); } catch { setAttachmentError("That board file could not be opened."); }
  }

  const showPages = !compactControls || notebookMode;
  const draftPosition = textDraft ? { left: `${clamp((textDraft.x * viewport.zoom + viewport.x) / BOARD_WIDTH * 100, 1, 75)}%`, top: `${clamp((textDraft.y * viewport.zoom + viewport.y) / BOARD_HEIGHT * 100, 1, 75)}%` } : undefined;

  return (
    <section ref={boardRootRef} className={cn("drawing-notebook", "native-board", compactControls && "is-compact-controls", notebookMode && "is-notebook-book", isFullscreen && "is-fullscreen")} aria-label={title}>
      {showPages && <div className="drawing-notebook-heading"><div className="drawing-book-title"><NotebookPen size={18} /><h3>{title}</h3></div><div className="drawing-notebook-heading-actions"><span className="native-board-save-status" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}</span><button type="button" className="drawing-fullscreen-button" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? "Exit full screen" : "View board full screen"}>{isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{isFullscreen ? "Exit" : "Full screen"}</span></button></div></div>}

      <div className="drawing-page-strip" aria-label="Notebook pages">
        {notebookMode && <label className="drawing-page-search"><Search size={14} /><input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Find a page or note" aria-label="Search notebook pages and notes" /></label>}
        <div className="drawing-page-tabs">{pageTabs.map((page) => { const index = visiblePages.findIndex((item) => item.id === page.id); return <button key={page.id} type="button" className={cn("drawing-page-tab", page.id === currentPage?.id && "is-active")} onClick={() => { if (textDraft) saveTextDraft(); dragRef.current = null; draftRef.current = null; setDraft(null); setErasedItemIds([]); setSelectedPageId(page.id); setSelectedId(null); setTextDraft(null); setViewport({ zoom: 1, x: 0, y: 0 }); }} aria-pressed={page.id === currentPage?.id}><span>{index + 1}</span>{notebookMode ? <small>{page.title || `Page ${index + 1}`}</small> : page.title || `Page ${index + 1}`}</button>; })}{notebookMode && pageSearch.trim() && !pageTabs.length && <span className="drawing-page-search-empty">No matching pages</span>}</div>
        <div className="drawing-page-actions">{currentPage && <button type="button" className="drawing-icon-button" onClick={deletePage} aria-label="Delete current page" title="Delete current page"><Trash2 size={15} /></button>}<button type="button" className="drawing-add-page" onClick={addPage} disabled={!bookIsLoaded}><Plus size={16} /> {notebookMode ? "New page" : "Add page"}</button></div>
      </div>

      {currentPage && <>
        {showPages && <div className="drawing-page-settings"><label className="drawing-page-name"><span>Page title</span><input value={currentPage.title} onChange={(event) => updatePage(currentPage.id, { title: event.target.value })} maxLength={50} /></label><label className="native-paper-picker"><span>Paper</span><select aria-label="Page background" value={currentPage.paperStyle} onChange={(event) => updatePage(currentPage.id, { paperStyle: event.target.value as PaperStyle })}><option value="plain">Plain</option><option value="dots">Dots</option><option value="lines">Ruled</option><option value="squares">Grid</option>{notebookMode && <option value="cornell">Cornell notes</option>}</select></label><button type="button" className="drawing-attachment-button" onClick={() => imageInputRef.current?.click()} title="Add an image to the board"><ImagePlus size={15} /> Image</button><button type="button" className="drawing-attachment-button" onClick={() => attachmentInputRef.current?.click()} title="Attach documents"><Upload size={15} /> Files</button></div>}
        <input ref={attachmentInputRef} className="sr-only" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple onChange={addFiles} aria-label="Add document attachments" />
        <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={(event) => void addImages(event)} aria-label="Add images to the board" />
        <input ref={importInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => void importBoard(event)} aria-label="Import board file" />

        <div className="drawing-toolbar native-board-toolbar">
          <div className="drawing-tool-switch" role="toolbar" aria-label="Board tools">{TOOL_OPTIONS.map((option) => { const Icon = option.icon; return <button key={option.id} type="button" className={cn(tool === option.id && "is-active")} onClick={() => { if (textDraft) saveTextDraft(); setTool(option.id); setTextDraft(null); }} aria-label={`${option.label}${option.shortcut ? ` (${option.shortcut})` : ""}`} title={`${option.label}${option.shortcut ? ` · ${option.shortcut}` : ""}`} aria-pressed={tool === option.id}><Icon size={16} /><span>{option.label}</span></button>; })}</div>
          <div className="drawing-board-toggle" role="group" aria-label="Board theme"><button type="button" className={cn(currentPage.boardKind === "white" && "is-active")} onClick={() => setBoardKind("white")} aria-pressed={currentPage.boardKind === "white"}><Sun size={15} /> White</button><button type="button" className={cn(currentPage.boardKind === "black" && "is-active")} onClick={() => setBoardKind("black")} aria-pressed={currentPage.boardKind === "black"}><Moon size={15} /> Black</button></div>
          {tool === "sticker" && <div className="drawing-sticker-palette native-stickers" aria-label="Choose sticker">{STICKERS.slice(0, 12).map((item) => <button key={item} type="button" className={cn(sticker === item && "is-active")} onClick={() => setSticker(item)} aria-label={`Choose ${item}`}>{item}</button>)}</div>}
          {tool !== "hand" && tool !== "select" && tool !== "sticker" && tool !== "eraser" && <div className="drawing-color-palette" role="group" aria-label="Ink color">{colors.map((color) => <button key={color} type="button" className={cn("drawing-color-swatch", (selectedItem && "color" in selectedItem ? selectedItem.color : currentPage.penColor) === color && "is-selected")} style={{ "--swatch-color": color } as React.CSSProperties} onClick={() => setInkColor(color)} aria-label={`Ink ${color}`} />)}<label className="native-custom-color" title="Choose custom color"><input type="color" value={selectedItem && "color" in selectedItem ? selectedItem.color : currentPage.penColor} onChange={(event) => setInkColor(event.target.value)} aria-label="Custom ink color" /></label></div>}
          {tool !== "hand" && tool !== "select" && tool !== "sticker" && tool !== "eraser" && <label className="native-board-range"><span>Width</span><input type="range" min="1" max="14" step="0.5" value={selectedItem?.kind === "stroke" ? selectedItem.width : selectedItem?.kind === "note" ? selectedItem.size / 5 : currentPage.penSize} onChange={(event) => setStrokeWidth(Number(event.target.value))} aria-label="Stroke width" /></label>}
          {tool === "eraser" && <label className="native-board-range"><span>Eraser</span><input type="range" min="12" max="80" step="2" value={currentPage.eraserSize} onChange={(event) => updatePage(currentPage.id, { eraserSize: Number(event.target.value) })} aria-label="Eraser size" /></label>}
          {(["rectangle", "ellipse", "diamond", "sticky"].includes(tool) || (selectedItem?.kind === "stroke" && ["rectangle", "ellipse", "diamond"].includes(selectedItem.shape))) && <div className="drawing-color-palette" role="group" aria-label="Shape fill">{(darkPaper ? DARK_FILLS : FILLS).map((fill) => <button key={fill} type="button" className={cn("drawing-color-swatch", "is-fill-swatch", fill === "transparent" && "is-transparent-swatch", (selectedItem?.kind === "stroke" || selectedItem?.kind === "note" ? selectedItem.fill : currentPage.fillColor) === fill && "is-selected")} style={{ "--swatch-color": fill } as React.CSSProperties} onClick={() => setFillColor(fill)} aria-label={fill === "transparent" ? "No fill" : `Fill ${fill}`} />)}</div>}
          {selectedItem?.kind === "stroke" && <><div className="native-line-style" role="group" aria-label="Line style">{(["solid", "dashed", "dotted"] as const).map((dash) => <button type="button" key={dash} className={cn(selectedItem.dash === dash && "is-active")} onClick={() => setLineStyle(dash)} aria-pressed={selectedItem.dash === dash}>{dash === "solid" ? "—" : dash === "dashed" ? "- -" : "···"}</button>)}</div><label className="native-board-range"><span>Opacity</span><input type="range" min="10" max="100" value={selectedItem.opacity} onChange={(event) => setOpacity(Number(event.target.value))} aria-label="Selected stroke opacity" /></label></>}
          {tool === "text" && <button type="button" className={cn("drawing-text-bold", textBold && "is-active")} onClick={() => setTextBold((value) => !value)} aria-pressed={textBold} aria-label="Bold text">B</button>}
          <label className="native-paper-picker native-toolbar-paper"><span>Paper</span><select aria-label="Page background" value={currentPage.paperStyle} onChange={(event) => updatePage(currentPage.id, { paperStyle: event.target.value as PaperStyle })}><option value="plain">Plain</option><option value="dots">Dots</option><option value="lines">Ruled</option><option value="squares">Grid</option>{notebookMode && <option value="cornell">Cornell notes</option>}</select></label>
          <div className="drawing-toolbar-actions native-board-actions">
            {compactControls && <button type="button" className="drawing-icon-button" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? "Exit full screen" : "Full screen"}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
            <button type="button" className="drawing-icon-button" onClick={() => imageInputRef.current?.click()} title="Add image to board" aria-label="Add image"><ImagePlus size={15} /></button><button type="button" className="drawing-icon-button" onClick={() => attachmentInputRef.current?.click()} title="Attach documents" aria-label="Attach files"><Upload size={15} /></button>
            <button type="button" className="drawing-icon-button" onClick={undo} disabled={!historyRef.current.get(currentPage.id)?.past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={16} /></button><button type="button" className="drawing-icon-button" onClick={redo} disabled={!historyRef.current.get(currentPage.id)?.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={16} /></button>
            {selectedItem && <><button type="button" className="drawing-icon-button" onClick={duplicateSelected} title="Duplicate selected (Ctrl+C then Ctrl+V)" aria-label="Duplicate selected"><Copy size={15} /></button><button type="button" className="drawing-icon-button" onClick={() => arrangeSelected("back")} title="Send backward" aria-label="Send backward"><ArrowDown size={15} /></button><button type="button" className="drawing-icon-button" onClick={() => arrangeSelected("front")} title="Bring forward" aria-label="Bring forward"><ArrowUp size={15} /></button><button type="button" className="drawing-icon-button" onClick={deleteSelected} title="Delete selected" aria-label="Delete selected"><Trash2 size={15} /></button></>}
            <details className="native-export-menu"><summary aria-label="Import and export" title="Import and export"><Download size={16} /></summary><div><button type="button" onClick={() => exportBoard("png")}>Export PNG</button><button type="button" onClick={() => exportBoard("svg")}>Export SVG</button><button type="button" onClick={() => exportBoard("json")}>Save board file</button><button type="button" onClick={() => importInputRef.current?.click()}>Open board file</button><button type="button" onClick={() => { const svg = serializeBoardSvg(); if (svg) void svg.text().then((value) => navigator.clipboard?.writeText(value)).catch(() => undefined); }}>Copy board as SVG</button></div></details>
            <button type="button" className="drawing-icon-button" onClick={() => commitItems([])} disabled={!currentPage.items.length} aria-label="Clear board" title="Clear board"><Trash2 size={15} /></button>
          </div>
        </div>

        <div className="native-board-stage" style={{ backgroundColor: background }}>
          <svg ref={svgRef} className={cn("drawing-canvas-svg", `is-${tool}`)} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" tabIndex={0} role="application" aria-label={`${currentPage.boardKind} board, page ${currentIndex + 1}`} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={finishPointer} onPointerCancel={finishPointer} onWheel={handleWheel} onContextMenu={(event) => event.preventDefault()}>
            <defs>
              <pattern id={`paper-${currentPage.id}`} width={currentPage.paperStyle === "dots" ? 24 : currentPage.paperStyle === "squares" ? 24 : 34} height={currentPage.paperStyle === "dots" ? 24 : currentPage.paperStyle === "squares" ? 24 : 34} patternUnits="userSpaceOnUse">
                {currentPage.paperStyle === "dots" && <circle cx="2" cy="2" r="1" fill={darkPaper ? "#5b6761" : "#d7dce5"} />}
                {(currentPage.paperStyle === "lines" || currentPage.paperStyle === "cornell") && <path d="M0 33.5H34" stroke={darkPaper ? "#3b4942" : "#e4e8ef"} strokeWidth="1" />}
                {currentPage.paperStyle === "squares" && <path d="M24 0H0V24" fill="none" stroke={darkPaper ? "#3b4942" : "#e4e8ef"} strokeWidth="1" />}
              </pattern>
              <filter id="sticky-shadow" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.14" /></filter>
            </defs>
            <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={background} />
            <g className="native-board-world" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
              <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill={`url(#paper-${currentPage.id})`} />
              {notebookMode && currentPage.paperStyle === "cornell" && <g className="notebook-cornell-guide" pointerEvents="none"><path d="M312 0V630M0 630H1200" fill="none" stroke={darkPaper ? "#64736a" : "#bcc8d6"} strokeWidth="2" /><text x="24" y="30" fill={darkPaper ? "#94a29a" : "#8c9aab"} fontSize="15" letterSpacing="2">CUES</text><text x="340" y="30" fill={darkPaper ? "#94a29a" : "#8c9aab"} fontSize="15" letterSpacing="2">NOTES</text><text x="24" y="670" fill={darkPaper ? "#94a29a" : "#8c9aab"} fontSize="15" letterSpacing="2">SUMMARY</text></g>}
              {sceneItems.map((sourceItem) => {
                const isSelected = selectedId === sourceItem.id; const isMoving = dragRef.current?.kind === "move" && dragRef.current.itemId === sourceItem.id;
                const resize = dragRef.current?.kind === "resize" && dragRef.current.itemId === sourceItem.id ? dragRef.current : null;
                const item = resize && resize.bounds && resize.handle ? resizeItem(sourceItem, resize.handle, resize.bounds, dragDelta) : sourceItem;
                const transform = isMoving ? `translate(${dragDelta.x} ${dragDelta.y})` : undefined;
                if (item.kind === "stroke") {
                  const d = pathFor(item.points, item.shape); const dash = item.dash === "dashed" ? `${item.width * 3} ${item.width * 2}` : item.dash === "dotted" ? `${item.width * 0.01} ${item.width * 2}` : undefined;
                  return <g key={item.id} data-board-id={item.id} transform={transform} opacity={item.opacity / 100}><path d={d} fill={item.shape !== "freehand" && item.shape !== "line" && item.shape !== "arrow" ? item.fill : "none"} stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} vectorEffect="non-scaling-stroke" />{isSelected && <path data-export-ui="true" d={d} fill="none" stroke="#5686ed" strokeWidth={item.width + 6} strokeDasharray="7 5" opacity="0.65" pointerEvents="none" vectorEffect="non-scaling-stroke" />}</g>;
                }
                if (item.kind === "note") {
                  const lines = item.value.split("\n"); const checklist = item.type === "checklist"; const rowHeight = 28;
                  return <g key={item.id} data-board-id={item.id} transform={transform} onDoubleClick={(event) => { event.stopPropagation(); if (tool === "select") editNote(item); }}>
                    {item.type !== "text" && <rect x={item.x} y={item.y} width={item.width} height={item.height} rx={item.type === "sticky" ? 8 : 12} fill={item.fill} stroke={isSelected ? "#5686ed" : darkPaper ? "#536159" : "#dce2e9"} strokeWidth={isSelected ? 2 : 1} filter={item.type === "sticky" ? "url(#sticky-shadow)" : undefined} />}
                    {item.type === "text" && isSelected && <rect data-export-ui="true" x={item.x - 5} y={item.y - item.size} width={item.width} height={Math.max(item.height, lines.length * item.size * 1.35)} fill="none" stroke="#5686ed" strokeWidth="2" strokeDasharray="6 4" />}
                    {checklist ? lines.map((line, index) => <g key={`${item.id}-${index}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const checked = [...(item.checked ?? lines.map(() => false))]; checked[index] = !checked[index]; commitItems(currentPage.items.map((candidate) => candidate.id === item.id ? { ...item, checked } : candidate)); }} style={{ cursor: "pointer" }}><rect x={item.x + 14} y={item.y + 18 + index * rowHeight} width="16" height="16" rx="4" fill={item.checked?.[index] ? "#58a06e" : "none"} stroke={item.checked?.[index] ? "#58a06e" : item.color} strokeWidth="1.5" />{item.checked?.[index] && <path d={`M${item.x + 18} ${item.y + 26 + index * rowHeight}l4 4 7-8`} fill="none" stroke="#fff" strokeWidth="2" />}{line && <text x={item.x + 40} y={item.y + 32 + index * rowHeight} fill={item.checked?.[index] ? "#8b968e" : item.color} fontSize={item.size} textDecoration={item.checked?.[index] ? "line-through" : undefined}>{line}</text>}</g>) : lines.map((line, index) => <text key={`${item.id}-${index}`} x={item.x + (item.type === "text" ? 0 : 16)} y={item.y + (item.type === "text" ? item.size : 30) + index * item.size * 1.3} fill={item.color} fontSize={item.size} fontWeight={item.bold ? 700 : 500} fontFamily="ui-rounded, system-ui, sans-serif">{line}</text>)}
                  </g>;
                }
                if (item.kind === "sticker") return <g key={item.id} data-board-id={item.id} transform={transform}><text x={item.x} y={item.y} fontSize={item.size} textAnchor="middle" dominantBaseline="central" fontFamily="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">{item.value}</text>{isSelected && <rect data-export-ui="true" x={item.x - item.size / 2 - 5} y={item.y - item.size / 2 - 5} width={item.size + 10} height={item.size + 10} fill="none" stroke="#5686ed" strokeDasharray="5 4" />}</g>;
                return <g key={item.id} data-board-id={item.id} transform={transform}><image href={item.src} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" />{isSelected && <rect data-export-ui="true" x={item.x} y={item.y} width={item.width} height={item.height} fill="none" stroke="#5686ed" strokeWidth="2" strokeDasharray="6 4" />}</g>;
              })}
              {tool === "select" && selectedItem && (() => { const resizing = dragRef.current?.kind === "resize" && dragRef.current.itemId === selectedItem.id ? dragRef.current : null; const display = resizing?.bounds && resizing.handle ? resizeItem(selectedItem, resizing.handle, resizing.bounds, dragDelta) : selectedItem; const bounds = itemBounds(display); const x = bounds.x - 5; const y = bounds.y - 5; const width = Math.max(12, bounds.width + 10); const height = Math.max(12, bounds.height + 10); const handles: NonNullable<DragState["handle"]>[] = ["nw", "ne", "sw", "se"]; return <g data-export-ui="true"><rect x={x} y={y} width={width} height={height} fill="none" stroke="#5686ed" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />{handles.map((handle) => { const hx = handle.includes("w") ? x - 4 : x + width - 4; const hy = handle.includes("n") ? y - 4 : y + height - 4; return <rect key={handle} x={hx} y={hy} width="8" height="8" rx="2" fill="#fff" stroke="#5686ed" strokeWidth="1.5" vectorEffect="non-scaling-stroke" data-resize-handle={handle} pointerEvents="all" />; })}</g>; })()}
            </g>
          </svg>
          {textDraft && <form className="drawing-text-entry native-board-text-entry" style={draftPosition} onSubmit={(event) => { event.preventDefault(); saveTextDraft(); }}><textarea ref={textInputRef} value={textDraft.value} onChange={(event) => setTextDraft((old) => old ? { ...old, value: event.target.value } : old)} onKeyDown={(event) => { if (event.key === "Escape") setTextDraft(null); }} placeholder={textDraft.type === "sticky" ? "Write a note…" : textDraft.type === "checklist" ? "One task per line…" : "Type on your board…"} aria-label="Board text" maxLength={1500} rows={5} /><button type="submit" aria-label="Place on board"><Check size={15} /></button><button type="button" onClick={() => setTextDraft(null)} aria-label="Cancel"><X size={15} /></button></form>}
          <div className="native-board-zoom-controls"><button type="button" onClick={() => zoomBy(0.85)} aria-label="Zoom out"><ZoomOut size={15} /></button><button type="button" onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })}>{Math.round(viewport.zoom * 100)}%</button><button type="button" onClick={() => zoomBy(1.18)} aria-label="Zoom in"><ZoomIn size={15} /></button></div>
          <span className="native-board-active-tool" aria-live="polite">{activeTool?.label}</span>
        </div>

        {(currentPage.attachments.length > 0 || attachmentError) && <div className="drawing-attachments" aria-label="Attached files">{currentPage.attachments.map((attachment) => <NotebookFileLink key={attachment.id} attachment={attachment} onRemove={() => updatePage(currentPage.id, { attachments: currentPage.attachments.filter((item) => item.id !== attachment.id) })} />)}{attachmentError && <p role="status">{attachmentError}</p>}</div>}
      </>}
    </section>
  );
}

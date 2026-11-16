"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Maximize2,
  Minimize2,
  NotebookPen,
  PenLine,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";

type BoardKind = "white" | "black";
type InkPoint = { x: number; y: number };
type InkStroke = { points: InkPoint[]; color: string; width: number; erase?: boolean };
type NotebookPage = {
  id: string;
  title: string;
  boardKind: BoardKind;
  penColor: string;
  penSize: number;
  eraserSize: number;
  strokes: InkStroke[];
};
type ActiveStroke = { pageId: string; stroke: InkStroke };
type NotebookProps = {
  storageScope: string;
  bookId: string;
  title: string;
  legacyDateKey?: string;
};
type StoredBook = { id: string; pages: NotebookPage[] };

const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 650;
const WHITE_INKS = ["#17191f", "#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c"];
const CHALK_INKS = ["#f8fafc", "#fde047", "#f9a8d4", "#67e8f9", "#86efac", "#fdba74"];
const PEN_SIZES = [
  { label: "Fine", value: 2.5 },
  { label: "Medium", value: 4.5 },
  { label: "Bold", value: 7.5 },
];
const ERASER_SIZES = [
  { label: "Small", value: 18 },
  { label: "Medium", value: 34 },
  { label: "Large", value: 56 },
];
let databasePromise: Promise<IDBDatabase> | null = null;

function openNotebookDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open("planit-notebooks", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("books")) request.result.createObjectStore("books", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

function makePage(title: string, boardKind: BoardKind = "white"): NotebookPage {
  return {
    id: crypto.randomUUID(),
    title,
    boardKind,
    penColor: boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0],
    penSize: PEN_SIZES[1].value,
    eraserSize: ERASER_SIZES[1].value,
    strokes: [],
  };
}

function strokePath(points: InkPoint[]) {
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  if (points.length === 1) return `${path} L${(points[0].x + 0.1).toFixed(1)},${points[0].y.toFixed(1)}`;
  return path;
}

function parseArray(value: string | null): unknown[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validPage(value: unknown): value is NotebookPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<NotebookPage>;
  return typeof page.id === "string"
    && typeof page.title === "string"
    && (page.boardKind === "white" || page.boardKind === "black")
    && Array.isArray(page.strokes);
}

function migratedPage(title: string, boardKind: BoardKind, legacy: unknown[]): NotebookPage {
  const background = boardKind === "white" ? "#ffffff" : "#18231f";
  const strokes = legacy.filter((stroke): stroke is InkStroke => {
    if (!stroke || typeof stroke !== "object") return false;
    const candidate = stroke as Partial<InkStroke>;
    return Array.isArray(candidate.points) && typeof candidate.color === "string";
  }).map((stroke) => ({
    ...stroke,
    erase: stroke.erase ?? stroke.color.toLowerCase() === background,
  }));
  return { ...makePage(title, boardKind), strokes };
}

function loadBook(key: string, scope: string, legacyDateKey: string | undefined, defaultTitle: string): NotebookPage[] {
  const saved = parseArray(window.localStorage.getItem(key));
  if (saved) {
    const pages = saved.filter(validPage);
    return pages.length ? pages : [makePage(defaultTitle)];
  }

  if (legacyDateKey) {
    const scopeKey = encodeURIComponent(scope);
    const whiteKey = `planit-board-v2:${scopeKey}:${legacyDateKey}:white`;
    const blackKey = `planit-board-v2:${scopeKey}:${legacyDateKey}:black`;
    const whiteStrokes = parseArray(window.localStorage.getItem(whiteKey));
    const blackStrokes = parseArray(window.localStorage.getItem(blackKey));
    if (whiteStrokes || blackStrokes) {
      const pages = [];
      if (whiteStrokes?.length) pages.push(migratedPage("White page", "white", whiteStrokes));
      if (blackStrokes?.length) pages.push(migratedPage("Black page", "black", blackStrokes));
      return pages.length ? pages : [makePage(defaultTitle)];
    }

    const oldWhite = parseArray(window.localStorage.getItem(`northstar-board-v1:${scopeKey}:${legacyDateKey}`));
    if (oldWhite?.length) return [migratedPage(defaultTitle, "white", oldWhite)];
  }

  return [makePage(defaultTitle)];
}

export function DrawingNotebook({ storageScope, bookId, title, legacyDateKey }: NotebookProps) {
  const storageKey = `planit-notebook-v1:${encodeURIComponent(storageScope)}:${encodeURIComponent(bookId)}`;
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [loadedBookKey, setLoadedBookKey] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStroke, setActiveStroke] = useState<ActiveStroke | null>(null);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let nextPages: NotebookPage[];
      try {
        const storedPages = await getStoredBook(storageKey);
        nextPages = storedPages?.length ? storedPages.filter(validPage) : loadBook(storageKey, storageScope, legacyDateKey, title);
        if (storedPages?.length && !nextPages.length) nextPages = [makePage(title)];
        await saveStoredBook(storageKey, nextPages);
      } catch {
        nextPages = loadBook(storageKey, storageScope, legacyDateKey, title);
      }
      if (cancelled) return;
      setPages(nextPages);
      setSelectedPageId(nextPages[0]?.id ?? null);
      setLoadedBookKey(storageKey);
      activeStrokeRef.current = null;
      setActiveStroke(null);
    }
    void load();
    return () => { cancelled = true; };
  }, [legacyDateKey, storageKey, storageScope, title]);

  useEffect(() => {
    if (loadedBookKey !== storageKey) return;
    void saveStoredBook(storageKey, pages).catch(() => {
      try { window.localStorage.setItem(storageKey, JSON.stringify(pages)); } catch { /* IndexedDB is unavailable or full. */ }
    });
  }, [loadedBookKey, pages, storageKey]);

  const bookIsLoaded = loadedBookKey === storageKey;
  const visiblePages = bookIsLoaded ? pages : [];
  const currentIndex = visiblePages.findIndex((page) => page.id === selectedPageId);
  const currentPage = currentIndex >= 0 ? visiblePages[currentIndex] : visiblePages[0];
  const inks = currentPage?.boardKind === "black" ? CHALK_INKS : WHITE_INKS;
  const background = currentPage?.boardKind === "black" ? "#18231f" : "#ffffff";
  const canvasStrokes = currentPage
    ? activeStroke?.pageId === currentPage.id
      ? [...currentPage.strokes, activeStroke.stroke]
      : currentPage.strokes
    : [];

  function updatePage(id: string, patch: Partial<NotebookPage>) {
    setPages((existing) => existing.map((page) => page.id === id ? { ...page, ...patch } : page));
  }

  function addPage() {
    const page = makePage(`Page ${pages.length + 1}`);
    setPages((existing) => [...existing, page]);
    setSelectedPageId(page.id);
    setTool("pen");
  }

  function deletePage() {
    if (!currentPage || pages.length <= 1) {
      if (currentPage) updatePage(currentPage.id, { title: "Page 1", strokes: [] });
      return;
    }
    const next = pages.filter((page) => page.id !== currentPage.id);
    setPages(next);
    setSelectedPageId(next[Math.max(0, currentIndex - 1)]?.id ?? next[0]?.id ?? null);
  }

  function pointFrom(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT,
    };
  }

  function showCursor(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, visible: event.pointerType === "mouse" || event.pointerType === "pen" });
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!bookIsLoaded || !currentPage || (event.button !== 0 && event.pointerType !== "pen")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const erase = tool === "eraser";
    const stroke: InkStroke = {
      points: [pointFrom(event)],
      color: erase ? background : currentPage.penColor,
      width: erase ? currentPage.eraserSize : currentPage.penSize,
      erase,
    };
    const active = { pageId: currentPage.id, stroke };
    activeStrokeRef.current = active;
    setActiveStroke(active);
    showCursor(event);
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>) {
    showCursor(event);
    const active = activeStrokeRef.current;
    if (!active) return;
    event.preventDefault();
    const next = { ...active, stroke: { ...active.stroke, points: [...active.stroke.points, pointFrom(event)] } };
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }

  function finishStroke() {
    const active = activeStrokeRef.current;
    if (!active) return;
    setPages((existing) => existing.map((page) => page.id === active.pageId
      ? { ...page, strokes: [...page.strokes, active.stroke] }
      : page));
    activeStrokeRef.current = null;
    setActiveStroke(null);
  }

  function movePage(amount: number) {
    const next = visiblePages[currentIndex + amount];
    if (next) setSelectedPageId(next.id);
  }

  return (
    <section className={cn("drawing-notebook", isFullscreen && "is-fullscreen")} aria-label={title}>
      <div className="drawing-notebook-heading">
        <div className="drawing-book-title"><NotebookPen size={18} /><h3>{title}</h3></div>
        <div className="drawing-notebook-heading-actions">
          {currentPage && <div className="drawing-page-number">Page {Math.max(0, currentIndex) + 1} of {visiblePages.length}</div>}
          <button type="button" className="drawing-fullscreen-button" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? "Exit full screen" : "View board full screen"}>
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{isFullscreen ? "Exit" : "Full screen"}</span>
          </button>
        </div>
      </div>

      <div className="drawing-page-strip" aria-label="Notebook pages">
        <div className="drawing-page-tabs">
          {visiblePages.map((page, index) => (
            <button key={page.id} type="button" className={cn("drawing-page-tab", page.id === currentPage?.id && "is-active")} onClick={() => setSelectedPageId(page.id)} aria-pressed={page.id === currentPage?.id}>
              <span>{index + 1}</span>{page.title || `Page ${index + 1}`}
            </button>
          ))}
        </div>
        <button type="button" className="drawing-add-page" onClick={addPage} disabled={!bookIsLoaded}><Plus size={16} /> Add page</button>
      </div>

      {currentPage && (
        <>
          <div className="drawing-page-settings">
            <label className="drawing-page-name"><span>Page title</span><input value={currentPage.title} onChange={(event) => updatePage(currentPage.id, { title: event.target.value })} maxLength={50} /></label>
            <div className="drawing-board-toggle" role="group" aria-label="Page board color">
              <button type="button" className={cn(currentPage.boardKind === "white" && "is-active")} onClick={() => updatePage(currentPage.id, { boardKind: "white" })}>Whiteboard</button>
              <button type="button" className={cn(currentPage.boardKind === "black" && "is-active")} onClick={() => updatePage(currentPage.id, { boardKind: "black" })}>Blackboard</button>
            </div>
            <button type="button" className="drawing-icon-button" onClick={deletePage} aria-label="Delete page" title={pages.length === 1 ? "Clear page" : "Delete page"}><Trash2 size={16} /></button>
          </div>

          <div className="drawing-toolbar">
            <div className="drawing-tool-switch" role="group" aria-label="Drawing tool">
              <button type="button" className={cn(tool === "pen" && "is-active")} onClick={() => setTool("pen")} aria-pressed={tool === "pen"}><PenLine size={16} /><span>Pen</span></button>
              <button type="button" className={cn(tool === "eraser" && "is-active")} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"}><Eraser size={16} /><span>Eraser</span></button>
            </div>

            {tool === "pen" ? (
              <>
                <div className="drawing-color-palette" role="group" aria-label="Pen color">
                  {inks.map((color) => <button key={color} type="button" className={cn("drawing-color-swatch", currentPage.penColor === color && "is-selected")} style={{ "--swatch-color": color } as React.CSSProperties} onClick={() => updatePage(currentPage.id, { penColor: color })} aria-label={`Choose pen color ${color}`} aria-pressed={currentPage.penColor === color} />)}
                </div>
                <div className="drawing-size-presets" role="group" aria-label="Pen size">
                  {PEN_SIZES.map((size) => <button key={size.label} type="button" className={cn(currentPage.penSize === size.value && "is-active")} onClick={() => updatePage(currentPage.id, { penSize: size.value })} aria-pressed={currentPage.penSize === size.value}><span className="drawing-size-mark" style={{ "--mark-size": `${size.value + 3}px` } as React.CSSProperties} />{size.label}</button>)}
                </div>
              </>
            ) : (
              <div className="drawing-size-presets" role="group" aria-label="Eraser size">
                {ERASER_SIZES.map((size) => <button key={size.label} type="button" className={cn(currentPage.eraserSize === size.value && "is-active")} onClick={() => updatePage(currentPage.id, { eraserSize: size.value })} aria-pressed={currentPage.eraserSize === size.value}><span className="drawing-eraser-mark" style={{ "--eraser-size": `${Math.min(22, size.value / 2)}px` } as React.CSSProperties} />{size.label}</button>)}
              </div>
            )}

            <div className="drawing-toolbar-actions">
              <button type="button" className="drawing-icon-button" onClick={() => updatePage(currentPage.id, { strokes: currentPage.strokes.slice(0, -1) })} disabled={!currentPage.strokes.length} aria-label="Undo last stroke" title="Undo"><Undo2 size={17} /></button>
              <button type="button" className="drawing-icon-button" onClick={() => updatePage(currentPage.id, { strokes: [] })} disabled={!currentPage.strokes.length} aria-label="Clear page" title="Clear page"><Trash2 size={16} /></button>
            </div>
          </div>

          <div className={cn("drawing-canvas", currentPage.boardKind === "black" && "is-blackboard")}>
            <svg viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => setCursor((old) => ({ ...old, visible: false }))} role="img" aria-label={`${currentPage.boardKind}board drawing page ${currentIndex + 1}`}>
              {canvasStrokes.map((stroke, index) => (
                <path key={index} d={strokePath(stroke.points)} fill="none" stroke={stroke.erase ? background : stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {cursor.visible && (
              <span className={cn("drawing-cursor", tool === "pen" ? "is-pen" : "is-eraser")} style={{ left: cursor.x, top: cursor.y, "--cursor-color": currentPage.penColor, "--cursor-size": `${currentPage.eraserSize}px` } as React.CSSProperties} />
            )}
          </div>
          <div className="drawing-page-footer">
            <button type="button" className="drawing-icon-button" onClick={() => movePage(-1)} disabled={currentIndex <= 0} aria-label="Previous page"><ChevronLeft size={17} /></button>
            <span>{currentPage.boardKind === "white" ? "White page" : "Black page"} · {currentPage.strokes.length ? "Saved on this device" : "Blank page"}</span>
            <button type="button" className="drawing-icon-button" onClick={() => movePage(1)} disabled={currentIndex >= visiblePages.length - 1} aria-label="Next page"><ChevronRight size={17} /></button>
          </div>
        </>
      )}
    </section>
  );
}

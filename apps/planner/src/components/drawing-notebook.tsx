"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eraser,
  Check,
  FileText,
  Minus,
  Maximize2,
  Minimize2,
  NotebookPen,
  PenLine,
  Plus,
  SmilePlus,
  Square,
  Trash2,
  Type,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type BoardKind = "white" | "black";
type InkPoint = { x: number; y: number };
type InkStroke = { points: InkPoint[]; color: string; width: number; erase?: boolean; shape?: "line" | "rectangle" };
type BoardText = { id: string; x: number; y: number; value: string; color: string; size: number; bold?: boolean };
type BoardSticker = { id: string; x: number; y: number; value: string; size: number };
type NotebookAttachment = { id: string; name: string; mimeType: string; size: number; blob: Blob };
type NotebookPage = {
  id: string;
  title: string;
  boardKind: BoardKind;
  penColor: string;
  penSize: number;
  eraserSize: number;
  strokes: InkStroke[];
  texts: BoardText[];
  stickers: BoardSticker[];
  textSize: number;
  attachments: NotebookAttachment[];
};
type ActiveStroke = { pageId: string; stroke: InkStroke };
type ActiveTextMove = { pageId: string; textId: string; offsetX: number; offsetY: number };
type TextDraft = { x: number; y: number; value: string; editId?: string };
type NotebookProps = {
  storageScope: string;
  bookId: string;
  title: string;
  legacyDateKey?: string;
  compactControls?: boolean;
  notebookMode?: boolean;
  paperColor?: string;
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
const TEXT_SIZES = [
  { label: "Small", value: 20 },
  { label: "Medium", value: 30 },
  { label: "Large", value: 42 },
];
const BOARD_STICKERS = ["⭐", "❤️", "✨", "🌈", "🚀", "🎯", "🔥", "☀️", "🌙", "🌸", "🍀", "🎉", "🏆", "🐱", "🐶", "📍", "💡", "🎨", "💖", "⚡", "🎵", "🌿", "🍓", "🦋", "☕", "🌻", "🪴", "🧠", "📚", "✅"];
const STICKER_SIZES = [
  { label: "Small", value: 32 },
  { label: "Medium", value: 48 },
  { label: "Large", value: 68 },
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
    texts: [],
    stickers: [],
    textSize: TEXT_SIZES[1].value,
    attachments: [],
  };
}

function isDarkPaper(color: string) {
  const value = color.replace("#", "");
  if (!/^[\da-f]{6}$/i.test(value)) return false;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 < 0.25;
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

function normalizePage(page: NotebookPage): NotebookPage {
  const candidate = page as NotebookPage & { texts?: unknown; stickers?: unknown; textSize?: unknown; attachments?: unknown };
  const texts = Array.isArray(candidate.texts) ? candidate.texts.filter((value): value is BoardText => {
    if (!value || typeof value !== "object") return false;
    const text = value as Partial<BoardText>;
    return typeof text.id === "string"
      && Number.isFinite(text.x)
      && Number.isFinite(text.y)
      && typeof text.value === "string"
      && typeof text.color === "string"
      && Number.isFinite(text.size);
  }) : [];
  const stickers = Array.isArray(candidate.stickers) ? candidate.stickers.filter((value): value is BoardSticker => {
    if (!value || typeof value !== "object") return false;
    const sticker = value as Partial<BoardSticker>;
    return typeof sticker.id === "string"
      && Number.isFinite(sticker.x)
      && Number.isFinite(sticker.y)
      && typeof sticker.value === "string"
      && Number.isFinite(sticker.size);
  }) : [];
  const textSize = TEXT_SIZES.some((size) => size.value === candidate.textSize)
    ? candidate.textSize as number
    : TEXT_SIZES[1].value;
  const attachments = Array.isArray(candidate.attachments) ? candidate.attachments.filter((value): value is NotebookAttachment => {
    if (!value || typeof value !== "object") return false;
    const attachment = value as Partial<NotebookAttachment>;
    return typeof attachment.id === "string"
      && typeof attachment.name === "string"
      && typeof attachment.mimeType === "string"
      && Number.isFinite(attachment.size)
      && attachment.blob instanceof Blob;
  }) : [];
  return { ...page, texts, stickers, textSize, attachments };
}

function NotebookFileLink({ attachment, onRemove }: { attachment: NotebookAttachment; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);
  return (
    <div className="drawing-attachment-row">
      <FileText size={16} />
      <div><a href={url || undefined} download={attachment.name}>{attachment.name}</a><small>{(attachment.size / (1024 * 1024)).toFixed(1)} MB</small></div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${attachment.name}`} title="Remove file"><X size={15} /></button>
    </div>
  );
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

function loadBook(key: string, scope: string, legacyDateKey: string | undefined, defaultTitle: string, defaultBoardKind: BoardKind = "white"): NotebookPage[] {
  const saved = parseArray(window.localStorage.getItem(key));
  if (saved) {
    const pages = saved.filter(validPage).map(normalizePage);
    return pages.length ? pages : [makePage(defaultTitle, defaultBoardKind)];
  }

  if (legacyDateKey) {
    const scopeKey = encodeURIComponent(scope);
    const whiteKey = `planit-board-v2:${scopeKey}:${legacyDateKey}:white`;
    const blackKey = `planit-board-v2:${scopeKey}:${legacyDateKey}:black`;
    const whiteStrokes = parseArray(window.localStorage.getItem(whiteKey));
    const blackStrokes = parseArray(window.localStorage.getItem(blackKey));
    if (whiteStrokes || blackStrokes) {
      const strokes = [
        ...(whiteStrokes?.length ? migratedPage(defaultTitle, "white", whiteStrokes).strokes : []),
        ...(blackStrokes?.length ? migratedPage(defaultTitle, "black", blackStrokes).strokes : []),
      ];
      return strokes.length ? [{ ...makePage(defaultTitle, defaultBoardKind), strokes }] : [makePage(defaultTitle, defaultBoardKind)];
    }

    const oldWhite = parseArray(window.localStorage.getItem(`northstar-board-v1:${scopeKey}:${legacyDateKey}`));
    if (oldWhite?.length) return [migratedPage(defaultTitle, "white", oldWhite)];
  }

  return [makePage(defaultTitle, defaultBoardKind)];
}

export function DrawingNotebook({ storageScope, bookId, title, legacyDateKey, compactControls = false, notebookMode = false, paperColor }: NotebookProps) {
  const storageKey = `planit-notebook-v1:${encodeURIComponent(storageScope)}:${encodeURIComponent(bookId)}`;
  const defaultBoardKind: BoardKind = paperColor && isDarkPaper(paperColor) ? "black" : "white";
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [loadedBookKey, setLoadedBookKey] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser" | "text" | "line" | "rectangle" | "sticker">("pen");
  const [selectedSticker, setSelectedSticker] = useState(BOARD_STICKERS[0]);
  const [stickerSize, setStickerSize] = useState(STICKER_SIZES[1].value);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStroke, setActiveStroke] = useState<ActiveStroke | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [textBold, setTextBold] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const activeTextMoveRef = useRef<ActiveTextMove | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [attachmentError, setAttachmentError] = useState("");

  useEffect(() => {
    if (textDraft) textInputRef.current?.focus();
  }, [textDraft]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let nextPages: NotebookPage[];
      try {
        const storedPages = await getStoredBook(storageKey);
        nextPages = storedPages?.length ? storedPages.filter(validPage).map(normalizePage) : loadBook(storageKey, storageScope, legacyDateKey, title, defaultBoardKind);
        if (storedPages?.length && !nextPages.length) nextPages = [makePage(title, defaultBoardKind)];
        await saveStoredBook(storageKey, nextPages);
      } catch {
        nextPages = loadBook(storageKey, storageScope, legacyDateKey, title, defaultBoardKind);
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
  }, [defaultBoardKind, legacyDateKey, storageKey, storageScope, title]);

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
  const selectedText = currentPage?.texts.find((item) => item.id === selectedTextId);
  const darkPaper = currentPage ? currentPage.boardKind === "black" : defaultBoardKind === "black";
  const inks = darkPaper ? CHALK_INKS : WHITE_INKS;
  const background = paperColor && currentPage?.boardKind === defaultBoardKind
    ? paperColor
    : (darkPaper ? "#18231f" : "#ffffff");
  const canvasStrokes = currentPage
    ? activeStroke?.pageId === currentPage.id
      ? [...currentPage.strokes, activeStroke.stroke]
      : currentPage.strokes
    : [];

  function updatePage(id: string, patch: Partial<NotebookPage>) {
    setPages((existing) => existing.map((page) => page.id === id ? { ...page, ...patch } : page));
  }

  function setBoardKind(boardKind: BoardKind) {
    if (!currentPage) return;
    updatePage(currentPage.id, { boardKind, penColor: boardKind === "white" ? WHITE_INKS[0] : CHALK_INKS[0] });
    setTextDraft(null);
  }

  function addPage() {
    const page = makePage(`Page ${pages.length + 1}`, defaultBoardKind);
    setPages((existing) => [...existing, page]);
    setSelectedPageId(page.id);
    setTool("pen");
    setTextDraft(null);
    setSelectedTextId(null);
  }

  function deletePage() {
    setTextDraft(null);
    setSelectedTextId(null);
    if (!currentPage || pages.length <= 1) {
      if (currentPage) updatePage(currentPage.id, { title: "Page 1", strokes: [], texts: [], stickers: [], attachments: [] });
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
    setCursor({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, visible: (tool === "pen" || tool === "eraser") && (event.pointerType === "mouse" || event.pointerType === "pen") });
  }

  function startStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!bookIsLoaded || !currentPage || (event.button !== 0 && event.pointerType !== "pen")) return;
    event.preventDefault();
    if (tool === "text") {
      const point = pointFrom(event);
      setSelectedTextId(null);
      setTextDraft({ x: point.x, y: point.y, value: "" });
      return;
    }
    if (tool === "sticker") {
      const point = pointFrom(event);
      updatePage(currentPage.id, {
        stickers: [...(currentPage.stickers ?? []), { id: crypto.randomUUID(), x: point.x, y: point.y, value: selectedSticker, size: stickerSize }],
      });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const erase = tool === "eraser";
    const stroke: InkStroke = {
      points: [pointFrom(event)],
      color: erase ? background : currentPage.penColor,
      width: erase ? currentPage.eraserSize : currentPage.penSize,
      erase,
      ...(tool === "line" ? { shape: "line" as const } : tool === "rectangle" ? { shape: "rectangle" as const } : {}),
    };
    const active = { pageId: currentPage.id, stroke };
    activeStrokeRef.current = active;
    setActiveStroke(active);
    showCursor(event);
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>) {
    showCursor(event);
    const movingText = activeTextMoveRef.current;
    if (movingText) {
      const point = pointFrom(event);
      setPages((existing) => existing.map((page) => page.id === movingText.pageId
        ? { ...page, texts: page.texts.map((item) => item.id === movingText.textId
          ? { ...item, x: point.x - movingText.offsetX, y: point.y - movingText.offsetY }
          : item) }
        : page));
      return;
    }
    const active = activeStrokeRef.current;
    if (!active) return;
    event.preventDefault();
    const point = pointFrom(event);
    const next = { ...active, stroke: { ...active.stroke, points: active.stroke.shape ? [active.stroke.points[0], point] : [...active.stroke.points, point] } };
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }

  function finishStroke() {
    activeTextMoveRef.current = null;
    const active = activeStrokeRef.current;
    if (!active) return;
    setPages((existing) => existing.map((page) => page.id === active.pageId
      ? { ...page, strokes: [...page.strokes, active.stroke] }
      : page));
    activeStrokeRef.current = null;
    setActiveStroke(null);
  }

  function saveTextDraft() {
    const draft = textDraft;
    if (!draft || !currentPage) return;
    const value = draft.value.trim();
    if (!value) {
      setTextDraft(null);
      return;
    }
    const texts = currentPage.texts ?? [];
    if (draft.editId) {
      updatePage(currentPage.id, {
        texts: texts.map((item) => item.id === draft.editId
          ? { ...item, value, color: currentPage.penColor, size: currentPage.textSize, bold: textBold }
          : item),
      });
    } else {
      updatePage(currentPage.id, {
        texts: [...texts, { id: crypto.randomUUID(), x: draft.x, y: draft.y, value, color: currentPage.penColor, size: currentPage.textSize, bold: textBold }],
      });
    }
    setTextDraft(null);
  }

  function handlePlacedTextPointerDown(event: React.PointerEvent<SVGTextElement>, item: BoardText) {
    event.preventDefault();
    event.stopPropagation();
    if (tool !== "text" && tool !== "eraser") return;
    if (!currentPage) return;
    if (tool === "eraser") {
      updatePage(currentPage.id, { texts: (currentPage.texts ?? []).filter((text) => text.id !== item.id) });
      setSelectedTextId(null);
      setTextDraft(null);
      return;
    }
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * BOARD_HEIGHT,
    };
    activeTextMoveRef.current = { pageId: currentPage.id, textId: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedTextId(item.id);
    setTextDraft(null);
  }

  function editSelectedText() {
    if (!selectedText) return;
    setTextBold(Boolean(selectedText.bold));
    setTextDraft({ x: selectedText.x, y: selectedText.y, value: selectedText.value, editId: selectedText.id });
  }

  function deleteSelectedText() {
    if (!currentPage || !selectedText) return;
    updatePage(currentPage.id, { texts: currentPage.texts.filter((item) => item.id !== selectedText.id) });
    setSelectedTextId(null);
    setTextDraft(null);
  }

  function undoMark() {
    if (!currentPage) return;
    if (tool === "text") {
      if (currentPage.texts.length) updatePage(currentPage.id, { texts: currentPage.texts.slice(0, -1) });
      return;
    }
    if (tool === "sticker") {
      if (currentPage.stickers.length) updatePage(currentPage.id, { stickers: currentPage.stickers.slice(0, -1) });
      return;
    }
    if (currentPage.strokes.length) {
      updatePage(currentPage.id, { strokes: currentPage.strokes.slice(0, -1) });
    } else if (currentPage.texts.length) {
      updatePage(currentPage.id, { texts: currentPage.texts.slice(0, -1) });
    }
  }

  function addAttachments(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!currentPage || !files.length) return;
    const allowedExtensions = /\.(pdf|doc|docx|odt|rtf|txt)$/i;
    const invalid = files.find((file) => !allowedExtensions.test(file.name) || file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (invalid) {
      setAttachmentError(`${invalid.name} is not supported. Choose a PDF or document file.`);
      return;
    }
    const tooLarge = files.find((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge) {
      setAttachmentError(`${tooLarge.name} is larger than the 50 MB per-file limit.`);
      return;
    }
    setAttachmentError("");
    const additions = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, mimeType: file.type, size: file.size, blob: file }));
    updatePage(currentPage.id, { attachments: [...currentPage.attachments, ...additions] });
  }

  return (
    <section className={cn("drawing-notebook", compactControls && "is-compact-controls", notebookMode && "is-notebook-book", isFullscreen && "is-fullscreen")} aria-label={title}>
      {(!compactControls || notebookMode) && <div className="drawing-notebook-heading">
        <div className="drawing-book-title"><NotebookPen size={18} /><h3>{title}</h3></div>
        <div className="drawing-notebook-heading-actions">
          <button type="button" className="drawing-fullscreen-button" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? "Exit full screen" : "View board full screen"}>
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{isFullscreen ? "Exit" : "Full screen"}</span>
          </button>
        </div>
      </div>}

      <div className="drawing-page-strip" aria-label="Notebook pages">
        <div className="drawing-page-tabs">
          {visiblePages.map((page, index) => (
            <button key={page.id} type="button" className={cn("drawing-page-tab", page.id === currentPage?.id && "is-active")} onClick={() => { setTextDraft(null); setSelectedTextId(null); setSelectedPageId(page.id); }} aria-pressed={page.id === currentPage?.id}>
              <span>{index + 1}</span>{!notebookMode && (page.title || `Page ${index + 1}`)}
            </button>
          ))}
        </div>
        <div className="drawing-page-actions">
          {notebookMode && currentPage && <button type="button" className="drawing-icon-button" onClick={deletePage} aria-label={pages.length === 1 ? "Clear current page" : "Delete current page"} title={pages.length === 1 ? "Clear current page" : "Delete current page"}><Trash2 size={15} /></button>}
          <button type="button" className="drawing-add-page" onClick={addPage} disabled={!bookIsLoaded}><Plus size={16} /> {notebookMode ? "New page" : "Add page"}</button>
        </div>
      </div>

      {currentPage && (
        <>
          <div className="drawing-page-settings">
            <label className="drawing-page-name"><span>Page title</span><input value={currentPage.title} onChange={(event) => updatePage(currentPage.id, { title: event.target.value })} maxLength={50} /></label>
            {!notebookMode && <button type="button" className="drawing-attachment-button" onClick={() => attachmentInputRef.current?.click()} title="PDF, Word, ODT, rich text, or plain text · up to 50 MB each"><Upload size={15} /> Add files</button>}
            <button type="button" className="drawing-icon-button" onClick={deletePage} aria-label="Delete page" title={pages.length === 1 ? "Clear page" : "Delete page"}><Trash2 size={16} /></button>
          </div>

          <input ref={attachmentInputRef} className="sr-only" type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple onChange={addAttachments} aria-label="Choose PDF or document files" />
          <div className="drawing-toolbar">
            <div className="drawing-board-toggle" role="group" aria-label="Board color">
              <button type="button" className={cn(currentPage.boardKind === "white" && "is-active")} onClick={() => setBoardKind("white")} aria-pressed={currentPage.boardKind === "white"}>White</button>
              <button type="button" className={cn(currentPage.boardKind === "black" && "is-active")} onClick={() => setBoardKind("black")} aria-pressed={currentPage.boardKind === "black"}>Black</button>
            </div>
            <div className="drawing-tool-switch" role="group" aria-label="Board tool">
              <button type="button" className={cn(tool === "pen" && "is-active")} onClick={() => { setTool("pen"); setTextDraft(null); setSelectedTextId(null); }} aria-pressed={tool === "pen"}><PenLine size={16} /><span>Pen</span></button>
              <button type="button" className={cn(tool === "text" && "is-active")} onClick={() => { setTool("text"); setTextDraft(null); }} aria-pressed={tool === "text"}><Type size={16} /><span>Text</span></button>
              <button type="button" className={cn(tool === "line" && "is-active")} onClick={() => { setTool("line"); setTextDraft(null); setSelectedTextId(null); }} aria-pressed={tool === "line"}><Minus size={16} /><span>Line</span></button>
              <button type="button" className={cn(tool === "rectangle" && "is-active")} onClick={() => { setTool("rectangle"); setTextDraft(null); setSelectedTextId(null); }} aria-pressed={tool === "rectangle"}><Square size={15} /><span>Box</span></button>
              <button type="button" className={cn(tool === "sticker" && "is-active")} onClick={() => { setTool("sticker"); setTextDraft(null); setSelectedTextId(null); }} aria-pressed={tool === "sticker"}><SmilePlus size={15} /><span>Sticker</span></button>
              <button type="button" className={cn(tool === "eraser" && "is-active")} onClick={() => { setTool("eraser"); setTextDraft(null); setSelectedTextId(null); }} aria-pressed={tool === "eraser"}><Eraser size={16} /><span>Eraser</span></button>
            </div>

            {tool === "sticker" ? (
              <>
                <div className="drawing-sticker-palette" role="group" aria-label="Choose a sticker">
                  {BOARD_STICKERS.map((sticker) => <button key={sticker} type="button" className={cn(selectedSticker === sticker && "is-active")} onClick={() => setSelectedSticker(sticker)} aria-label={`Choose ${sticker} sticker`} aria-pressed={selectedSticker === sticker}>{sticker}</button>)}
                </div>
                <div className="drawing-size-presets" role="group" aria-label="Sticker size">
                  {STICKER_SIZES.map((size) => <button key={size.label} type="button" className={cn(stickerSize === size.value && "is-active")} onClick={() => setStickerSize(size.value)} aria-pressed={stickerSize === size.value}>{size.label}</button>)}
                </div>
              </>
            ) : tool !== "eraser" ? (
              <>
                <div className="drawing-color-palette" role="group" aria-label={tool === "text" ? "Text color" : "Pen color"}>
                  {inks.map((color) => <button key={color} type="button" className={cn("drawing-color-swatch", currentPage.penColor === color && "is-selected")} style={{ "--swatch-color": color } as React.CSSProperties} onClick={() => updatePage(currentPage.id, { penColor: color })} aria-label={`Choose ${tool === "text" ? "text" : "pen"} color ${color}`} aria-pressed={currentPage.penColor === color} />)}
                </div>
                {tool === "pen" || tool === "line" || tool === "rectangle" ? (
                  <div className="drawing-size-presets" role="group" aria-label="Pen size">
                    {PEN_SIZES.map((size) => <button key={size.label} type="button" className={cn(currentPage.penSize === size.value && "is-active")} onClick={() => updatePage(currentPage.id, { penSize: size.value })} aria-pressed={currentPage.penSize === size.value}><span className="drawing-size-mark" style={{ "--mark-size": `${size.value + 3}px` } as React.CSSProperties} />{size.label}</button>)}
                  </div>
                ) : (
                  <div className="drawing-size-presets" role="group" aria-label="Text size">
                    {TEXT_SIZES.map((size) => <button key={size.label} type="button" className={cn(currentPage.textSize === size.value && "is-active")} onClick={() => updatePage(currentPage.id, { textSize: size.value })} aria-pressed={currentPage.textSize === size.value}><span className="drawing-text-size-mark" style={{ fontSize: `${Math.max(10, size.value / 2)}px` }}>A</span>{size.label}</button>)}
                  </div>
                )}
                {tool === "text" && <button type="button" className={cn("drawing-text-bold", textBold && "is-active")} onClick={() => setTextBold((value) => !value)} aria-pressed={textBold} title="Toggle bold text">B</button>}
              </>
            ) : (
              <div className="drawing-size-presets" role="group" aria-label="Eraser size">
                {ERASER_SIZES.map((size) => <button key={size.label} type="button" className={cn(currentPage.eraserSize === size.value && "is-active")} onClick={() => updatePage(currentPage.id, { eraserSize: size.value })} aria-pressed={currentPage.eraserSize === size.value}><span className="drawing-eraser-mark" style={{ "--eraser-size": `${Math.min(22, size.value / 2)}px` } as React.CSSProperties} />{size.label}</button>)}
              </div>
            )}

            <div className="drawing-toolbar-actions">
              {compactControls && <button type="button" className="drawing-icon-button" onClick={() => setIsFullscreen((value) => !value)} aria-label={isFullscreen ? "Exit full screen" : "View board full screen"} title={isFullscreen ? "Exit full screen" : "Full screen"}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
              {notebookMode && <button type="button" className="drawing-attachment-button drawing-toolbar-upload" onClick={() => attachmentInputRef.current?.click()} title="Upload PDF or document"><Upload size={15} /><span>Files</span></button>}
              {tool === "text" && selectedText && (
                <>
                  <span className="drawing-text-selection-hint">Drag to move</span>
                  <button type="button" className="drawing-icon-button" onClick={editSelectedText} aria-label="Edit selected text" title="Edit text"><PenLine size={15} /></button>
                  <button type="button" className="drawing-icon-button" onClick={deleteSelectedText} aria-label="Delete selected text" title="Delete text"><Trash2 size={15} /></button>
                </>
              )}
              <button type="button" className="drawing-icon-button" onClick={undoMark} disabled={tool === "text" ? !currentPage.texts.length : tool === "sticker" ? !currentPage.stickers.length : !currentPage.strokes.length && !currentPage.texts.length} aria-label={tool === "text" ? "Undo last text" : tool === "sticker" ? "Undo last sticker" : "Undo last mark"} title="Undo"><Undo2 size={17} /></button>
              <button type="button" className="drawing-icon-button" onClick={() => { setTextDraft(null); updatePage(currentPage.id, { strokes: [], texts: [], stickers: [] }); }} disabled={!currentPage.strokes.length && !currentPage.texts.length && !currentPage.stickers.length} aria-label="Clear page" title="Clear page"><Trash2 size={16} /></button>
            </div>
          </div>

          <div className={cn("drawing-canvas", darkPaper && "is-blackboard")} style={{ backgroundColor: background }}>
            <svg className={cn(tool === "text" && "is-text-tool", tool === "eraser" && "is-eraser-tool")} viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => setCursor((old) => ({ ...old, visible: false }))} role="img" aria-label={notebookMode ? `${title}, page ${currentIndex + 1}` : `${currentPage.boardKind}board drawing page ${currentIndex + 1}`}>
              {canvasStrokes.map((stroke, index) => (
                <path key={index} d={stroke.shape === "rectangle" && stroke.points.length > 1
                  ? `M${stroke.points[0].x},${stroke.points[0].y} L${stroke.points[1].x},${stroke.points[0].y} L${stroke.points[1].x},${stroke.points[1].y} L${stroke.points[0].x},${stroke.points[1].y} Z`
                  : strokePath(stroke.points)} fill="none" stroke={stroke.erase ? background : stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ))}
              {currentPage.stickers.map((sticker) => <text key={sticker.id} x={sticker.x} y={sticker.y} fontSize={sticker.size} textAnchor="middle" dominantBaseline="central" fontFamily="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" pointerEvents="none">{sticker.value}</text>)}
              {currentPage.texts.map((item) => (
                <g key={item.id}>
                  {tool === "text" && item.id === selectedTextId && <rect x={item.x - 5} y={item.y - item.size} width={Math.max(item.size * 2, Math.max(...item.value.split("\n").map((line) => line.length)) * item.size * 0.62 + 10)} height={item.size * 1.45 * item.value.split("\n").length} rx={5} fill="none" stroke="#5686ed" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                  <text x={item.x} y={item.y} fill={item.color} fontSize={item.size} fontFamily="ui-rounded, system-ui, sans-serif" fontWeight={item.bold ? "750" : "500"} onPointerDown={(event) => handlePlacedTextPointerDown(event, item)}>{item.value.split("\n").map((line, lineIndex) => <tspan key={lineIndex} x={item.x} dy={lineIndex === 0 ? 0 : item.size * 1.25}>{line || " "}</tspan>)}</text>
                </g>
              ))}
            </svg>
            {textDraft && (
              <form className="drawing-text-entry" style={{ left: `clamp(8px, ${(textDraft.x / BOARD_WIDTH) * 100}%, calc(100% - 300px))`, top: `clamp(8px, ${(textDraft.y / BOARD_HEIGHT) * 100}%, calc(100% - 140px))`, "--text-color": currentPage.penColor } as React.CSSProperties} onSubmit={(event) => { event.preventDefault(); saveTextDraft(); }}>
                <textarea ref={textInputRef} value={textDraft.value} onChange={(event) => setTextDraft((draft) => draft ? { ...draft, value: event.target.value } : draft)} onKeyDown={(event) => { if (event.key === "Escape") setTextDraft(null); }} placeholder="Type on your board…" aria-label="Text to place on board" maxLength={600} rows={4} />
                <button type="submit" aria-label="Place text"><Check size={15} /></button>
                <button type="button" onClick={() => setTextDraft(null)} aria-label="Cancel text"><X size={15} /></button>
              </form>
            )}
            {cursor.visible && tool !== "text" && (
              <span className={cn("drawing-cursor", tool === "pen" ? "is-pen" : "is-eraser")} style={{ left: cursor.x, top: cursor.y, "--cursor-color": currentPage.penColor, "--cursor-size": `${currentPage.eraserSize}px` } as React.CSSProperties} />
            )}
          </div>
          {(currentPage.attachments.length > 0 || attachmentError) && (
            <div className="drawing-attachments" aria-label="Attached files">
              {currentPage.attachments.map((attachment) => (
                <NotebookFileLink key={attachment.id} attachment={attachment} onRemove={() => updatePage(currentPage.id, { attachments: currentPage.attachments.filter((item) => item.id !== attachment.id) })} />
              ))}
              {attachmentError && <p role="status">{attachmentError}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

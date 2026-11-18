"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Brush, CheckSquare, Download, Eraser, FilePlus2, Focus, Heading2, Italic, List, Quote, Search, Trash2, Eye, PenLine, Minus } from "lucide-react";

type WritingDocument = { id: string; title: string; content: string; updatedAt: number };
type WritingTemplate = "blank" | "journal" | "story" | "meeting" | "letter";
type SavedWriting = { documents: WritingDocument[]; activeId: string | null };
type CalligraphyPoint = { x: number; y: number };
type CalligraphyStroke = { points: CalligraphyPoint[]; color: string; width: number; angle: number };
type CalligraphyGuide = "ruled" | "slanted" | "plain";

const TEMPLATES: { id: WritingTemplate; name: string; title: string; content: string }[] = [
  { id: "blank", name: "Blank page", title: "Untitled", content: "" },
  { id: "journal", name: "Daily journal", title: "Daily journal", content: "# Today\n\n**What happened today?**\n\n**What am I grateful for?**\n\n**One thing I learned:**\n\n**Tomorrow, I want to:**\n" },
  { id: "story", name: "Story draft", title: "Story draft", content: "# Story title\n\n## Opening\n\n\n## Scene notes\n\n- Character:\n- Place:\n- What changes:\n\n## Next scene\n" },
  { id: "meeting", name: "Meeting notes", title: "Meeting notes", content: "# Meeting notes\n\n**Date:** \n**People:** \n**Purpose:** \n\n## Discussion\n\n- \n\n## Decisions\n\n- [ ] \n\n## Next steps\n\n- [ ] \n" },
  { id: "letter", name: "Letter", title: "A letter", content: "Dear \n\n\n\nWarmly,\n" },
];

function createDocument(template: WritingTemplate): WritingDocument {
  const base = TEMPLATES.find((item) => item.id === template) ?? TEMPLATES[0];
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: base.title, content: base.content, updatedAt: Date.now() };
}

function isWritingDocument(value: unknown): value is WritingDocument {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WritingDocument>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.content === "string" && typeof item.updatedAt === "number";
}

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(title: string) {
  return (title.trim() || "writing").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function previewLines(text: string) {
  return text.split("\n").map((line, index) => {
    if (!line.trim()) return <div className="writing-preview-spacer" key={index} />;
    if (/^---+$/.test(line.trim())) return <hr key={index} />;
    if (line.startsWith("### ")) return <h3 key={index}>{renderInline(line.slice(4))}</h3>;
    if (line.startsWith("## ")) return <h2 key={index}>{renderInline(line.slice(3))}</h2>;
    if (line.startsWith("# ")) return <h1 key={index}>{renderInline(line.slice(2))}</h1>;
    if (line.startsWith("> ")) return <blockquote key={index}>{renderInline(line.slice(2))}</blockquote>;
    if (/^[-*] \[[ xX]\] /.test(line)) return <p className="writing-preview-list" key={index}>{renderInline(line.slice(6))}</p>;
    if (/^[-*] /.test(line)) return <p className="writing-preview-list" key={index}>{renderInline(line.slice(2))}</p>;
    if (/^\d+\. /.test(line)) return <p className="writing-preview-list" key={index}>{renderInline(line.replace(/^\d+\. /, ""))}</p>;
    return <p key={index}>{renderInline(line)}</p>;
  });
}

export function WritingStudio({ storageScope }: { storageScope: string }) {
  const storageKey = `planit-writing-studio-v1:${encodeURIComponent(storageScope)}`;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const calligraphyCanvasRef = useRef<HTMLCanvasElement>(null);
  const calligraphyStrokesRef = useRef<CalligraphyStroke[]>([]);
  const activeCalligraphyStrokeRef = useRef<CalligraphyStroke | null>(null);
  const [documents, setDocuments] = useState<WritingDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState<WritingTemplate>("blank");
  const [preview, setPreview] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [editorTypeface, setEditorTypeface] = useState<"serif" | "sans" | "script">("serif");
  const [editorTextSize, setEditorTextSize] = useState(16);
  const [editorLineHeight, setEditorLineHeight] = useState(1.85);
  const [calligraphyOpen, setCalligraphyOpen] = useState(false);
  const [calligraphyPrompt, setCalligraphyPrompt] = useState("Aa Bb Cc  1 2 3");
  const [calligraphyGuide, setCalligraphyGuide] = useState<CalligraphyGuide>("ruled");
  const [calligraphyColor, setCalligraphyColor] = useState("#17211c");
  const [calligraphyWidth, setCalligraphyWidth] = useState(12);
  const [calligraphyAngle, setCalligraphyAngle] = useState(-35);
  const [calligraphyRevision, setCalligraphyRevision] = useState(0);

  useEffect(() => {
    setLoadedKey("");
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SavedWriting>;
        const validDocuments = Array.isArray(parsed.documents) ? parsed.documents.filter(isWritingDocument) : [];
        const nextDocuments = validDocuments.length ? validDocuments : [createDocument("blank")];
        setDocuments(nextDocuments);
        setActiveId(typeof parsed.activeId === "string" && nextDocuments.some((item) => item.id === parsed.activeId) ? parsed.activeId : nextDocuments[0].id);
      } else {
        const first = createDocument("blank");
        setDocuments([first]);
        setActiveId(first.id);
      }
    } catch {
      const first = createDocument("blank");
      setDocuments([first]);
      setActiveId(first.id);
      setSaveState("error");
    }
    setLoadedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ documents, activeId } satisfies SavedWriting));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [activeId, documents, loadedKey, storageKey]);

  const activeDocument = documents.find((item) => item.id === activeId) ?? null;
  const visibleDocuments = useMemo(() => documents.filter((item) => `${item.title}\n${item.content}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt), [documents, search]);
  const wordCount = activeDocument?.content.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const characterCount = activeDocument?.content.length ?? 0;
  const editorFont = editorTypeface === "script" ? "cursive" : editorTypeface === "sans" ? "system-ui, sans-serif" : "ui-serif, Georgia, 'Times New Roman', serif";

  function stampCalligraphy(ctx: CanvasRenderingContext2D, point: CalligraphyPoint, stroke: CalligraphyStroke) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(stroke.angle * Math.PI / 180);
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, stroke.width / 2, Math.max(1, stroke.width * 0.17), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paintCalligraphyGuides(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(0, 0, width, height);
    if (calligraphyGuide !== "plain") {
      ctx.strokeStyle = "rgba(95, 128, 156, .28)";
      ctx.lineWidth = 1;
      for (let y = 34; y < height; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.moveTo(0, y + 21);
        ctx.lineTo(width, y + 21);
        ctx.moveTo(0, y + 62);
        ctx.lineTo(width, y + 62);
        ctx.stroke();
      }
      if (calligraphyGuide === "slanted") {
        ctx.strokeStyle = "rgba(211, 127, 120, .23)";
        for (let x = -height; x < width + height; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, height);
          ctx.lineTo(x + height * 0.48, 0);
          ctx.stroke();
        }
      }
    }
    if (calligraphyPrompt.trim()) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#4c5b51";
      ctx.font = "48px cursive";
      ctx.fillText(calligraphyPrompt.slice(0, 36), 22, 78, width - 44);
      ctx.restore();
    }
    for (const stroke of calligraphyStrokesRef.current) {
      stroke.points.forEach((point) => stampCalligraphy(ctx, point, stroke));
    }
  }

  useEffect(() => {
    if (!calligraphyOpen) return;
    const canvas = calligraphyCanvasRef.current;
    if (!canvas) return;
    const redraw = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintCalligraphyGuides(canvas, context);
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [calligraphyAngle, calligraphyColor, calligraphyGuide, calligraphyOpen, calligraphyPrompt, calligraphyRevision, calligraphyWidth]);

  function getCalligraphyPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function startCalligraphyStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: CalligraphyStroke = { points: [], color: calligraphyColor, width: calligraphyWidth, angle: calligraphyAngle };
    activeCalligraphyStrokeRef.current = stroke;
    addCalligraphyPoint(event, stroke);
  }

  function addCalligraphyPoint(event: React.PointerEvent<HTMLCanvasElement>, stroke: CalligraphyStroke) {
    const point = getCalligraphyPoint(event);
    const previous = stroke.points[stroke.points.length - 1];
    if (!previous) stroke.points.push(point);
    else {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(2, stroke.width * 0.18)));
      for (let index = 1; index <= steps; index += 1) stroke.points.push({ x: previous.x + (point.x - previous.x) * index / steps, y: previous.y + (point.y - previous.y) * index / steps });
    }
    const canvas = calligraphyCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      const ratio = window.devicePixelRatio || 1;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      stroke.points.slice(-Math.max(1, Math.ceil(Math.hypot(point.x - (previous?.x ?? point.x), point.y - (previous?.y ?? point.y)) / Math.max(2, stroke.width * 0.18)))).forEach((sample) => stampCalligraphy(context, sample, stroke));
    }
  }

  function moveCalligraphyStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = activeCalligraphyStrokeRef.current;
    if (stroke) addCalligraphyPoint(event, stroke);
  }

  function finishCalligraphyStroke() {
    const stroke = activeCalligraphyStrokeRef.current;
    if (!stroke) return;
    calligraphyStrokesRef.current = [...calligraphyStrokesRef.current, stroke];
    activeCalligraphyStrokeRef.current = null;
    setCalligraphyRevision((revision) => revision + 1);
  }

  function clearCalligraphyPad() {
    calligraphyStrokesRef.current = [];
    activeCalligraphyStrokeRef.current = null;
    setCalligraphyRevision((revision) => revision + 1);
  }

  function exportCalligraphyPad() {
    const canvas = calligraphyCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => { if (blob) downloadBlob("calligraphy-practice.png", blob); });
  }

  function updateDocument(id: string, changes: Partial<Pick<WritingDocument, "title" | "content">>) {
    setDocuments((current) => current.map((item) => item.id === id ? { ...item, ...changes, updatedAt: Date.now() } : item));
  }

  function addDocument() {
    const next = createDocument(template);
    setDocuments((current) => [next, ...current]);
    setActiveId(next.id);
    setPreview(false);
  }

  function deleteDocument(id: string) {
    const remaining = documents.filter((item) => item.id !== id);
    if (!remaining.length) {
      const next = createDocument("blank");
      setDocuments([next]);
      setActiveId(next.id);
      return;
    }
    setDocuments(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  }

  function insertMarkdown(before: string, after = "", placeholder = "text") {
    const editor = editorRef.current;
    if (!activeDocument || !editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = activeDocument.content.slice(start, end) || placeholder;
    const insertion = `${before}${selected}${after}`;
    const content = `${activeDocument.content.slice(0, start)}${insertion}${activeDocument.content.slice(end)}`;
    updateDocument(activeDocument.id, { content });
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function exportDocument(type: "markdown" | "text") {
    if (!activeDocument) return;
    const extension = type === "markdown" ? "md" : "txt";
    downloadText(`${safeFilename(activeDocument.title)}.${extension}`, activeDocument.content, type === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8");
  }

  return (
    <section className={`writing-studio${focusMode ? " is-focus-mode" : ""}`} aria-label="Writing studio">
      {!focusMode && <header className="writing-studio-heading">
        <div><p className="studio-eyebrow">Draft, reflect, and collect ideas</p><h3>Writing studio</h3><p>Your drafts save on this device as you write.</p></div>
        <div className="writing-studio-heading-actions">
          <select aria-label="New document template" value={template} onChange={(event) => setTemplate(event.target.value as WritingTemplate)}>{TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button type="button" className="planit-primary-button" onClick={addDocument}><FilePlus2 size={16} /> New draft</button>
        </div>
      </header>}

      <div className="writing-studio-layout">
        {!focusMode && <aside className="writing-document-shelf">
          <label className="writing-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a draft" aria-label="Search drafts" /></label>
          <div className="writing-document-list" aria-label="Drafts">
            {visibleDocuments.map((item) => <div className={`writing-document-item${item.id === activeId ? " is-active" : ""}`} key={item.id}>
              <button type="button" className="writing-document-open" onClick={() => { setActiveId(item.id); setPreview(false); }}><strong>{item.title || "Untitled"}</strong><small>{item.content.trim().slice(0, 68) || "Empty draft"}</small></button>
              <button type="button" className="writing-document-delete" onClick={() => deleteDocument(item.id)} aria-label={`Delete ${item.title || "untitled draft"}`} title="Delete draft"><Trash2 size={14} /></button>
            </div>)}
            {!visibleDocuments.length && <p className="writing-empty-search">No drafts match this search.</p>}
          </div>
          <button type="button" className="writing-new-draft" onClick={addDocument}><FilePlus2 size={15} /> New draft</button>
        </aside>}

        <article className="writing-editor-card">
          {focusMode && <div className="writing-focus-top"><span><PenLine size={15} /> Focus writing</span><button type="button" className="planit-secondary-button" onClick={() => setFocusMode(false)}><Focus size={15} /> Exit focus</button></div>}
          {activeDocument ? <>
            <div className="writing-document-title-row"><input className="writing-document-title" value={activeDocument.title} maxLength={100} onChange={(event) => updateDocument(activeDocument.id, { title: event.target.value })} aria-label="Draft title" placeholder="Untitled" /><span className={`writing-save-state ${saveState === "error" ? "is-error" : ""}`} aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save unavailable" : "Saved"}</span></div>
            <div className="writing-toolbar" aria-label="Writing tools">
              <button type="button" onClick={() => insertMarkdown("# ")} title="Heading"><Heading2 size={16} /><span>Heading</span></button>
              <button type="button" onClick={() => insertMarkdown("**", "**")} title="Bold"><Bold size={16} /><span>Bold</span></button>
              <button type="button" onClick={() => insertMarkdown("*", "*")} title="Italic"><Italic size={16} /><span>Italic</span></button>
              <button type="button" onClick={() => insertMarkdown("- ")} title="Bullet list"><List size={16} /><span>List</span></button>
              <button type="button" onClick={() => insertMarkdown("- [ ] ")} title="Checklist"><CheckSquare size={16} /><span>Checklist</span></button>
              <button type="button" onClick={() => insertMarkdown("> ")} title="Quote"><Quote size={16} /><span>Quote</span></button>
              <button type="button" onClick={() => insertMarkdown("\n---\n", "", "")} title="Divider"><Minus size={16} /><span>Divider</span></button>
              <button type="button" className={calligraphyOpen ? "is-active" : ""} onClick={() => setCalligraphyOpen((value) => !value)} aria-pressed={calligraphyOpen} title="Calligraphy practice"><Brush size={16} /><span>Calligraphy</span></button>
              <span className="writing-toolbar-spacer" />
              <button type="button" className={preview ? "is-active" : ""} onClick={() => setPreview((value) => !value)} aria-pressed={preview} title={preview ? "Edit draft" : "Preview draft"}>{preview ? <PenLine size={16} /> : <Eye size={16} />}<span>{preview ? "Edit" : "Preview"}</span></button>
              <button type="button" onClick={() => setFocusMode((value) => !value)} aria-pressed={focusMode} title="Focus mode"><Focus size={16} /><span>Focus</span></button>
            </div>
            <div className="writing-type-controls">
              <label><span>Typeface</span><select value={editorTypeface} onChange={(event) => setEditorTypeface(event.target.value as typeof editorTypeface)}><option value="serif">Book serif</option><option value="sans">Clean sans</option><option value="script">Cursive</option></select></label>
              <label className="writing-size-control"><span>Size <small>{editorTextSize}px</small></span><input type="range" min="12" max="30" value={editorTextSize} onChange={(event) => setEditorTextSize(Number(event.target.value))} /></label>
              <label><span>Line spacing</span><select value={editorLineHeight} onChange={(event) => setEditorLineHeight(Number(event.target.value))}><option value={1.5}>Compact</option><option value={1.85}>Relaxed</option><option value={2.2}>Wide</option></select></label>
            </div>
            {calligraphyOpen && <section className="calligraphy-practice" aria-label="Calligraphy practice pad">
              <div className="calligraphy-heading"><div><h4>Calligraphy practice</h4><p>Practice letterforms with an angled broad nib. Your guide sheet adjusts as you write.</p></div><div><button type="button" onClick={clearCalligraphyPad}><Eraser size={14} /> Clear</button><button type="button" onClick={exportCalligraphyPad}><Download size={14} /> Save PNG</button></div></div>
              <div className="calligraphy-controls">
                <label><span>Practice letters</span><input value={calligraphyPrompt} maxLength={36} onChange={(event) => setCalligraphyPrompt(event.target.value)} /></label>
                <label><span>Guides</span><select value={calligraphyGuide} onChange={(event) => setCalligraphyGuide(event.target.value as CalligraphyGuide)}><option value="ruled">Ruled</option><option value="slanted">Slanted guides</option><option value="plain">Plain paper</option></select></label>
                <label className="calligraphy-color-control"><span>Ink</span><input type="color" value={calligraphyColor} onChange={(event) => setCalligraphyColor(event.target.value)} aria-label="Calligraphy ink color" /></label>
                <label className="calligraphy-range"><span>Nib width <small>{calligraphyWidth}px</small></span><input type="range" min="4" max="28" value={calligraphyWidth} onChange={(event) => setCalligraphyWidth(Number(event.target.value))} /></label>
                <label className="calligraphy-range"><span>Nib angle <small>{calligraphyAngle}°</small></span><input type="range" min="-60" max="60" value={calligraphyAngle} onChange={(event) => setCalligraphyAngle(Number(event.target.value))} /></label>
              </div>
              <canvas ref={calligraphyCanvasRef} className="calligraphy-practice-canvas" onPointerDown={startCalligraphyStroke} onPointerMove={moveCalligraphyStroke} onPointerUp={finishCalligraphyStroke} onPointerCancel={finishCalligraphyStroke} aria-label="Draw calligraphy strokes here" />
              <small className="calligraphy-help">Draw with a mouse, stylus, or finger. The broad nib changes its stroke with your angle setting.</small>
            </section>}
            {preview ? <div className="writing-preview" style={{ fontFamily: editorFont, fontSize: `${editorTextSize}px`, lineHeight: editorLineHeight }} aria-label="Draft preview">{previewLines(activeDocument.content)}</div> : <textarea ref={editorRef} className="writing-editor" style={{ fontFamily: editorFont, fontSize: `${editorTextSize}px`, lineHeight: editorLineHeight }} value={activeDocument.content} onChange={(event) => updateDocument(activeDocument.id, { content: event.target.value })} placeholder="Start writing… Use the toolbar for headings, lists, checklists, and quotes." aria-label="Draft content" spellCheck />}
            <footer className="writing-editor-footer"><div><span>{wordCount} words</span><i /> <span>{characterCount} characters</span><i /> <span>~{Math.max(1, Math.ceil(wordCount / 220))} min read</span></div><div><button type="button" onClick={() => exportDocument("markdown")}><Download size={14} /> Export .md</button><button type="button" onClick={() => exportDocument("text")}><Download size={14} /> Export .txt</button></div></footer>
          </> : <div className="writing-no-document"><PenLine size={24} /><span>Choose a draft or start a new one.</span></div>}
        </article>
      </div>
    </section>
  );
}

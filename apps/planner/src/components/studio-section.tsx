"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Brush, Download, FlipHorizontal2, Film, ImagePlus, NotebookPen, RotateCcw, RotateCw, Scissors, Upload, Video } from "lucide-react";
import { DrawingNotebook } from "@/components/drawing-notebook";
import { WritingStudio } from "@/components/writing-studio";

type StudioTab = "photo" | "video" | "art" | "writing";
type CropPreset = "original" | "square" | "portrait" | "landscape";
type PhotoSize = "original" | "1920" | "1280" | "800";
type PhotoAdjustments = { brightness: number; contrast: number; saturation: number; grayscale: number; blur: number };
type EditOptions = PhotoAdjustments & { rotation: number; flip: boolean; watermark: string };
const DEFAULT_ADJUSTMENTS: PhotoAdjustments = { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 };
const CROPS: Record<CropPreset, number | null> = { original: null, square: 1, portrait: 4 / 5, landscape: 16 / 9 };
const ADJUSTMENT_CONTROLS: { key: keyof PhotoAdjustments; label: string; min: number; max: number; unit: string }[] = [
  { key: "brightness", label: "Brightness", min: 25, max: 200, unit: "%" },
  { key: "contrast", label: "Contrast", min: 25, max: 200, unit: "%" },
  { key: "saturation", label: "Saturation", min: 0, max: 200, unit: "%" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, unit: "%" },
  { key: "blur", label: "Blur", min: 0, max: 12, unit: "px" },
];

function filenameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "edited-media";
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The edited image could not be exported.")), type, 0.94);
  });
}

function makeFilter(options: PhotoAdjustments) {
  return `brightness(${options.brightness}%) contrast(${options.contrast}%) saturate(${options.saturation}%) grayscale(${options.grayscale}%) blur(${options.blur}px)`;
}

function orientedSize(width: number, height: number, rotation: number) {
  return Math.abs(rotation % 180) === 90 ? { width: height, height: width } : { width, height };
}

function drawWatermark(context: CanvasRenderingContext2D, width: number, height: number, text: string) {
  if (!text.trim()) return;
  const padding = Math.max(16, width * 0.025);
  context.save();
  context.filter = "none";
  context.font = `600 ${Math.max(18, width * 0.035)}px system-ui, sans-serif`;
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.shadowColor = "rgba(0,0,0,.72)";
  context.shadowBlur = Math.max(3, width * 0.006);
  context.shadowOffsetY = 1;
  context.fillStyle = "#fff";
  context.fillText(text.slice(0, 80), width - padding, height - padding, width * 0.86);
  context.restore();
}

function drawEditedPhoto(canvas: HTMLCanvasElement, image: ImageBitmap, crop: CropPreset, options: EditOptions, maxOutputWidth: number) {
  const size = orientedSize(image.width, image.height, options.rotation);
  const oriented = document.createElement("canvas");
  oriented.width = Math.max(1, Math.round(size.width));
  oriented.height = Math.max(1, Math.round(size.height));
  const orientedContext = oriented.getContext("2d");
  if (!orientedContext) throw new Error("Image editing is unavailable in this browser.");
  orientedContext.translate(oriented.width / 2, oriented.height / 2);
  orientedContext.scale(options.flip ? -1 : 1, 1);
  orientedContext.rotate(options.rotation * Math.PI / 180);
  orientedContext.drawImage(image, -image.width / 2, -image.height / 2);

  const ratio = CROPS[crop];
  let cropWidth = oriented.width;
  let cropHeight = oriented.height;
  if (ratio && oriented.width / oriented.height > ratio) cropWidth = oriented.height * ratio;
  else if (ratio) cropHeight = oriented.width / ratio;
  const cropX = (oriented.width - cropWidth) / 2;
  const cropY = (oriented.height - cropHeight) / 2;
  const outputWidth = Math.max(1, Math.min(cropWidth, maxOutputWidth));
  const outputHeight = Math.max(1, Math.round(outputWidth * cropHeight / cropWidth));
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image editing is unavailable in this browser.");
  context.filter = makeFilter(options);
  context.drawImage(oriented, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  drawWatermark(context, outputWidth, outputHeight, options.watermark);
}

function drawVideoFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement, options: EditOptions, maxDimension = 1280) {
  if (!video.videoWidth || !video.videoHeight) return;
  const size = orientedSize(video.videoWidth, video.videoHeight, options.rotation);
  const dimensionLimit = maxDimension > 0 ? maxDimension : Math.max(size.width, size.height);
  const scale = Math.min(1, dimensionLimit / Math.max(size.width, size.height));
  const canvasWidth = Math.max(1, Math.round(size.width * scale));
  const canvasHeight = Math.max(1, Math.round(size.height * scale));
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Video editing is unavailable in this browser.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.filter = makeFilter(options);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale((options.flip ? -1 : 1) * scale, scale);
  context.rotate(options.rotation * Math.PI / 180);
  context.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
  context.restore();
  drawWatermark(context, canvas.width, canvas.height, options.watermark);
}

export function StudioSection({ isActive, storageScope }: { isActive: boolean; storageScope: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<StudioTab>("photo");
  const [file, setFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [crop, setCrop] = useState<CropPreset>("original");
  const [photoSize, setPhotoSize] = useState<PhotoSize>("original");
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [watermark, setWatermark] = useState("");
  const [duration, setDuration] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [videoAvailableWidth, setVideoAvailableWidth] = useState(0);
  const [videoViewportHeight, setVideoViewportHeight] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const options = useMemo<EditOptions>(() => ({ ...adjustments, rotation, flip, watermark }), [adjustments, rotation, flip, watermark]);
  const filter = makeFilter(adjustments);
  const orientedVideoSize = orientedSize(videoDimensions.width, videoDimensions.height, rotation);
  const videoHeightCap = Math.min(videoViewportHeight * (videoAvailableWidth <= 760 ? 0.6 : 0.68) || 720, 720);
  const videoStageScale = videoAvailableWidth && orientedVideoSize.width && orientedVideoSize.height
    ? Math.min(videoAvailableWidth / orientedVideoSize.width, videoHeightCap / orientedVideoSize.height)
    : 0;
  const videoStageWidth = orientedVideoSize.width * videoStageScale;
  const videoStageHeight = orientedVideoSize.height * videoStageScale;
  const videoElementWidth = Math.abs(rotation % 180) === 90 ? videoStageHeight : videoStageWidth;
  const videoElementHeight = Math.abs(rotation % 180) === 90 ? videoStageWidth : videoStageHeight;

  useEffect(() => {
    if (!file) { setMediaUrl(""); return; }
    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!isActive && !exporting) videoRef.current?.pause();
  }, [exporting, isActive]);

  useEffect(() => {
    const stage = videoStageRef.current;
    const parent = stage?.parentElement;
    if (!stage || !parent) return;
    const updateViewport = () => setVideoViewportHeight(window.innerHeight);
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setVideoAvailableWidth((current) => Math.abs(current - width) < 1 ? current : width);
    });
    observer.observe(parent);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewport);
    };
  }, [file, tab]);

  useEffect(() => {
    if (!file?.type.startsWith("image/")) return;
    let cancelled = false;
    createImageBitmap(file, { resizeWidth: 1400, resizeQuality: "high" }).then((image) => {
      if (cancelled) { image.close(); return; }
      try {
        const canvas = photoCanvasRef.current;
        if (canvas) {
          const size = orientedSize(image.width, image.height, rotation);
          drawEditedPhoto(canvas, image, crop, options, Math.min(size.width, 1400));
        }
      } finally { image.close(); }
    }).catch(() => { if (!cancelled) setError("This image could not be previewed in the browser."); });
    return () => { cancelled = true; };
  }, [file, crop, options]);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    if (nextFile.type.startsWith("image/")) setTab("photo");
    else if (nextFile.type.startsWith("video/")) setTab("video");
    else { setError("Choose an image or video file."); return; }
    setFile(nextFile);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setCrop("original"); setPhotoSize("original"); setRotation(0); setFlip(false); setWatermark("");
    setDuration(0); setVideoDimensions({ width: 0, height: 0 }); setTrimStart(0); setTrimEnd(0); setPlayhead(0); setPlaybackRate(1); setMuted(false);
    setError(""); setNotice("");
  }

  function resetEdits() {
    setAdjustments(DEFAULT_ADJUSTMENTS); setCrop("original"); setPhotoSize("original"); setRotation(0); setFlip(false); setWatermark("");
  }

  async function exportPhoto() {
    if (!file || !file.type.startsWith("image/")) return;
    setExporting(true); setError(""); setNotice("");
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      try {
        const size = orientedSize(image.width, image.height, rotation);
        const maxWidth = photoSize === "original" ? size.width : Number(photoSize);
        drawEditedPhoto(canvas, image, crop, options, Math.min(size.width, maxWidth));
      } finally { image.close(); }
      const blob = await canvasBlob(canvas, "image/png");
      downloadBlob(`${filenameWithoutExtension(file.name)}-edited.png`, blob);
      setNotice("Edited photo downloaded as PNG.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export this photo.");
    } finally {
      setExporting(false);
    }
  }

  function updateTrimStart(value: number) {
    if (!Number.isFinite(value)) return;
    setTrimStart(Math.max(0, Math.min(value, Math.max(0, trimEnd - 0.1))));
  }

  function updateTrimEnd(value: number) {
    if (!Number.isFinite(value)) return;
    setTrimEnd(Math.min(duration, Math.max(value, trimStart + 0.1)));
  }

  function setBoundary(boundary: "start" | "end") {
    const time = videoRef.current?.currentTime ?? 0;
    if (boundary === "start") updateTrimStart(time);
    else updateTrimEnd(time);
  }

  async function saveVideoFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      const canvas = document.createElement("canvas");
      drawVideoFrame(canvas, video, options, 0);
      const blob = await canvasBlob(canvas, "image/png");
      downloadBlob(`${filenameWithoutExtension(file?.name ?? "video")}-frame.png`, blob);
      setNotice("Edited video frame downloaded as PNG."); setError("");
    } catch (frameError) {
      setError(frameError instanceof Error ? frameError.message : "Could not save this video frame.");
    }
  }

  async function exportVideoClip() {
    const video = videoRef.current as (HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    const canvas = videoCanvasRef.current;
    if (!file || !video || !canvas || trimEnd <= trimStart) return;
    const canvasCapture = canvas.captureStream;
    if (!canvasCapture || typeof MediaRecorder === "undefined") {
      setError("Trim export is not supported in this browser. You can still preview the selected clip range.");
      return;
    }
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setError("This browser cannot export a trimmed video clip."); return; }
    setExporting(true); setError(""); setNotice("");
    try {
      if (Math.abs(video.currentTime - trimStart) > 0.05) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error("Could not seek to the clip start.")); };
          const cleanup = () => { video.removeEventListener("seeked", onSeeked); video.removeEventListener("error", onError); };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onError, { once: true });
          video.currentTime = trimStart;
        });
      }

      drawVideoFrame(canvas, video, options);
      const canvasStream = canvasCapture.call(canvas, 30);
      const sourceCapture = video.captureStream ?? video.mozCaptureStream;
      const sourceStream = !muted && sourceCapture ? sourceCapture.call(video) : null;
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...(sourceStream?.getAudioTracks() ?? []),
      ]);
      const recorder = new MediaRecorder(combinedStream, { mimeType });
      const chunks: BlobPart[] = [];
      await new Promise<void>((resolve, reject) => {
        let animationFrame = 0;
        let stopTimer = 0;
        let lastDrawAt = 0;
        let playbackFailed = false;
        let renderFailed = false;
        const cleanup = () => {
          window.clearTimeout(stopTimer);
          window.cancelAnimationFrame(animationFrame);
          video.removeEventListener("timeupdate", onTimeUpdate);
          video.pause();
          canvasStream.getTracks().forEach((track) => track.stop());
          sourceStream?.getTracks().forEach((track) => track.stop());
        };
        const stop = () => { if (recorder.state !== "inactive") recorder.stop(); };
        const onTimeUpdate = () => { if (video.currentTime >= trimEnd) stop(); };
        const drawLoop = (time: number) => {
          if (recorder.state === "inactive") return;
          if (time - lastDrawAt >= 33) {
            try { drawVideoFrame(canvas, video, options); }
            catch { renderFailed = true; stop(); return; }
            lastDrawAt = time;
          }
          animationFrame = window.requestAnimationFrame(drawLoop);
        };
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { cleanup(); reject(new Error("Video export failed. Try a shorter clip.")); };
        recorder.onstop = () => {
          cleanup();
          if (playbackFailed) { reject(new Error("Video playback was blocked. Press play once, then try exporting again.")); return; }
          if (renderFailed) { reject(new Error("The video preview could not be rendered for export.")); return; }
          const blob = new Blob(chunks, { type: mimeType });
          if (!blob.size) { reject(new Error("No video data was recorded. Try exporting again.")); return; }
          downloadBlob(`${filenameWithoutExtension(file.name)}-clip.webm`, blob);
          resolve();
        };
        video.addEventListener("timeupdate", onTimeUpdate);
        recorder.start(250);
        animationFrame = window.requestAnimationFrame(drawLoop);
        stopTimer = window.setTimeout(stop, Math.ceil(((trimEnd - trimStart) / Math.max(playbackRate, 0.1)) * 1000) + 6000);
        video.play().catch(() => { playbackFailed = true; stop(); });
      });
      setNotice("Edited trimmed clip downloaded as WebM.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export this video clip.");
    } finally {
      setExporting(false);
    }
  }

  function renderAdjustmentControls() {
    return ADJUSTMENT_CONTROLS.map(({ key, label, min, max, unit }) => (
      <label className="studio-adjustment" key={key}>
        <span>{label}<small>{adjustments[key]}{unit}</small></span>
        <input type="range" min={min} max={max} value={adjustments[key]} disabled={exporting} onChange={(event) => setAdjustments((current) => ({ ...current, [key]: Number(event.target.value) }))} />
      </label>
    ));
  }

  return (
    <section className="studio-section" role="tabpanel" aria-label="Studio">
      <header className="studio-heading">
        <div><p className="studio-eyebrow">Create and polish</p><h2>Studio</h2><p>Draw, write, and edit media in one creative workspace.</p></div>
        <div className="studio-heading-actions">
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/*,video/*" onChange={(event) => { chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} aria-label="Choose a photo or video" />
          {(tab === "photo" || tab === "video") && <button type="button" className="planit-primary-button" onClick={() => fileInputRef.current?.click()} disabled={exporting}><Upload size={16} /> Choose media</button>}
        </div>
      </header>

      <div className="studio-mode-tabs studio-workspace-tabs" role="tablist" aria-label="Studio workspace">
        <button type="button" role="tab" aria-selected={tab === "photo"} className={tab === "photo" ? "is-active" : ""} onClick={() => { setTab("photo"); setError(""); }} disabled={exporting}><ImagePlus size={16} /> Photo</button>
        <button type="button" role="tab" aria-selected={tab === "video"} className={tab === "video" ? "is-active" : ""} onClick={() => { setTab("video"); setError(""); }} disabled={exporting}><Film size={16} /> Video</button>
        <button type="button" role="tab" aria-selected={tab === "art"} className={tab === "art" ? "is-active" : ""} onClick={() => { setTab("art"); setError(""); }} disabled={exporting}><Brush size={16} /> Art studio</button>
        <button type="button" role="tab" aria-selected={tab === "writing"} className={tab === "writing" ? "is-active" : ""} onClick={() => { setTab("writing"); setError(""); }} disabled={exporting}><NotebookPen size={16} /> Writing studio</button>
      </div>

      {tab === "art" ? <section className="studio-art-workspace" aria-label="Art studio"><header><div><h3>Art studio</h3><p>Sketch, paint, build layers, and keep multi-page canvases here.</p></div></header><DrawingNotebook storageScope={storageScope} bookId="art-studio" title="Art studio" compactControls notebookMode /></section> : tab === "writing" ? <WritingStudio storageScope={storageScope} /> : !file || !mediaUrl ? (
        <button type="button" className="studio-empty" onClick={() => fileInputRef.current?.click()} disabled={exporting}>
          <span>{tab === "photo" ? <ImagePlus size={25} /> : <Video size={25} />}</span>
          <strong>Choose a {tab === "photo" ? "photo" : "video"} to edit</strong>
          <small>Files stay on your device. Nothing is uploaded.</small>
        </button>
      ) : (
        <div className="studio-workspace">
          <main className="studio-preview-card">
            {tab === "photo" ? file.type.startsWith("image/") ? <canvas ref={photoCanvasRef} className="studio-photo-preview" role="img" aria-label={`Edited preview of ${file.name}`} /> : <div className="studio-wrong-media"><ImagePlus size={24} /><span>Choose a photo for photo editing.</span></div> : file.type.startsWith("video/") ? <div ref={videoStageRef} className="studio-video-stage" style={videoStageWidth && videoStageHeight ? { width: `${videoStageWidth}px`, height: `${videoStageHeight}px` } : { aspectRatio: "16 / 9" }}><video ref={videoRef} key={mediaUrl} className="studio-video-preview" src={mediaUrl} controls playsInline preload="metadata" muted={muted} style={{ width: videoElementWidth ? `${videoElementWidth}px` : undefined, height: videoElementHeight ? `${videoElementHeight}px` : undefined, filter, transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})` }} onLoadedMetadata={(event) => { const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0; setDuration(nextDuration); setVideoDimensions({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight }); setTrimStart(0); setTrimEnd(nextDuration); setPlayhead(0); event.currentTarget.playbackRate = playbackRate; }} onTimeUpdate={(event) => { setPlayhead(event.currentTarget.currentTime); if (duration > 0 && event.currentTarget.currentTime >= trimEnd && !exporting) event.currentTarget.pause(); }} /></div> : <div className="studio-wrong-media"><Video size={24} /><span>Choose a video for video editing.</span></div>}
            <canvas ref={videoCanvasRef} className="studio-export-canvas" aria-hidden="true" />
            <div className="studio-preview-caption"><strong title={file.name}>{file.name}</strong><span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span></div>
          </main>

          <aside className="studio-tools-card">
            {tab === "photo" ? <>
              <div className="studio-tools-heading"><ImagePlus size={17} /><div><h3>Photo adjustments</h3><p>Crop, transform, adjust, and export a new copy.</p></div></div>
              <label className="studio-select-setting"><span>Crop shape</span><select value={crop} disabled={exporting} onChange={(event) => setCrop(event.target.value as CropPreset)}><option value="original">Original proportions</option><option value="square">Square · 1:1</option><option value="portrait">Portrait · 4:5</option><option value="landscape">Landscape · 16:9</option></select></label>
              <div className="studio-transform-controls"><button type="button" onClick={() => setRotation((value) => (value + 270) % 360)} aria-label="Rotate photo left" disabled={exporting}><RotateCcw size={16} /> Left</button><button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate photo right" disabled={exporting}><RotateCw size={16} /> Right</button><button type="button" className={flip ? "is-active" : ""} onClick={() => setFlip((value) => !value)} aria-pressed={flip} disabled={exporting}><FlipHorizontal2 size={16} /> Flip</button></div>
              {renderAdjustmentControls()}
              <label className="studio-select-setting"><span>Export width</span><select value={photoSize} disabled={exporting} onChange={(event) => setPhotoSize(event.target.value as PhotoSize)}><option value="original">Original size</option><option value="1920">Up to 1920 px</option><option value="1280">Up to 1280 px</option><option value="800">Up to 800 px</option></select></label>
              <label className="studio-select-setting"><span>Text watermark <small>optional</small></span><input value={watermark} onChange={(event) => setWatermark(event.target.value)} disabled={exporting} maxLength={80} placeholder="Add a signature or caption" /></label>
              <button type="button" className="planit-secondary-button" onClick={resetEdits} disabled={exporting}>Reset photo edits</button>
              <button type="button" className="planit-primary-button" onClick={() => void exportPhoto()} disabled={exporting || !file.type.startsWith("image/")}><Download size={16} />{exporting ? "Exporting…" : "Export edited photo"}</button>
            </> : <>
              <div className="studio-tools-heading"><Scissors size={17} /><div><h3>Video editing</h3><p>Trim a clip, adjust its look, and export the edited range.</p></div></div>
              <div className="studio-video-transform-controls"><button type="button" onClick={() => setRotation((value) => (value + 270) % 360)} aria-label="Rotate video left" disabled={exporting}><RotateCcw size={15} /> Rotate left</button><button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate video right" disabled={exporting}><RotateCw size={15} /> Rotate right</button><button type="button" className={flip ? "is-active" : ""} onClick={() => setFlip((value) => !value)} aria-pressed={flip} disabled={exporting}><FlipHorizontal2 size={15} /> Flip</button><button type="button" className={muted ? "is-active" : ""} onClick={() => setMuted((value) => !value)} aria-pressed={muted} disabled={exporting}>{muted ? "Muted" : "Sound on"}</button></div>
              {renderAdjustmentControls()}
              <label className="studio-select-setting"><span>Playback speed</span><select value={playbackRate} disabled={exporting} onChange={(event) => { const rate = Number(event.target.value); setPlaybackRate(rate); if (videoRef.current) videoRef.current.playbackRate = rate; }}><option value={0.5}>0.5× slow</option><option value={0.75}>0.75×</option><option value={1}>1× normal</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2× fast</option></select></label>
              <label className="studio-select-setting"><span>Text watermark <small>optional</small></span><input value={watermark} onChange={(event) => setWatermark(event.target.value)} disabled={exporting} maxLength={80} placeholder="Add a signature or caption" /></label>
              <button type="button" className="planit-secondary-button" onClick={resetEdits} disabled={exporting}>Reset video edits</button>
              <div className="studio-trim-timeline"><div><span>Playhead</span><strong>{playhead.toFixed(1)}s / {duration.toFixed(1)}s</strong></div><input type="range" min={0} max={Math.max(duration, 0)} step="0.1" value={Math.min(playhead, duration)} onChange={(event) => { if (videoRef.current) videoRef.current.currentTime = Number(event.target.value); }} aria-label="Video playhead" disabled={!duration || exporting} /></div>
              <label className="studio-trim-setting"><span>Start</span><span><input type="number" min={0} max={Math.max(0, duration)} step="0.1" value={trimStart} disabled={!duration || exporting} onChange={(event) => updateTrimStart(Number(event.target.value))} /> s</span><button type="button" onClick={() => setBoundary("start")} disabled={!duration || exporting}>Set to playhead</button></label>
              <label className="studio-trim-setting"><span>End</span><span><input type="number" min={Math.min(duration, trimStart + 0.1)} max={duration} step="0.1" value={trimEnd} disabled={!duration || exporting} onChange={(event) => updateTrimEnd(Number(event.target.value))} /> s</span><button type="button" onClick={() => setBoundary("end")} disabled={!duration || exporting}>Set to playhead</button></label>
              <div className="studio-clip-summary"><span>Selected clip</span><strong>{Math.max(0, trimEnd - trimStart).toFixed(1)} seconds</strong></div>
              <div className="studio-video-actions"><button type="button" className="planit-secondary-button" onClick={() => void saveVideoFrame()} disabled={!duration || exporting}><ImagePlus size={15} /> Save current frame</button><button type="button" className="planit-primary-button" onClick={() => void exportVideoClip()} disabled={exporting || !file.type.startsWith("video/") || duration <= 0 || trimEnd <= trimStart}><Download size={16} />{exporting ? "Rendering clip…" : "Export edited clip"}</button></div>
              <p className="studio-export-note">Video export records playback in real time and downloads WebM. Audio is included when browser capture supports it.</p>
            </>}
          </aside>
        </div>
      )}

      {error && <p className="studio-message is-error" role="alert">{error}</p>}
      {notice && <p className="studio-message" role="status">{notice}</p>}
    </section>
  );
}

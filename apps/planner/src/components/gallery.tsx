"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, ImagePlus, Music2, Trash2, Upload, Video } from "lucide-react";

type GalleryItem = {
  id: string;
  scope: string;
  name: string;
  type: "image" | "video" | "audio";
  mimeType: string;
  createdAt: number;
  blob: Blob;
  folderId?: string;
};
type GalleryFolder = { id: string; scope: string; name: string; createdAt: number };

let galleryDatabase: Promise<IDBDatabase> | null = null;

function openGalleryDatabase() {
  if (galleryDatabase) return galleryDatabase;
  galleryDatabase = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open("kiroku-gallery", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("media")) {
        request.result.createObjectStore("media", { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains("folders")) {
        request.result.createObjectStore("folders", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return galleryDatabase;
}

async function readGallery(scope: string) {
  const database = await openGalleryDatabase();
  return new Promise<GalleryItem[]>((resolve, reject) => {
    const request = database.transaction("media", "readonly").objectStore("media").getAll();
    request.onsuccess = () => resolve((request.result as GalleryItem[]).filter((item) => item.scope === scope));
    request.onerror = () => reject(request.error);
  });
}

async function readGalleryFolders(scope: string) {
  const database = await openGalleryDatabase();
  return new Promise<GalleryFolder[]>((resolve, reject) => {
    const request = database.transaction("folders", "readonly").objectStore("folders").getAll();
    request.onsuccess = () => resolve((request.result as GalleryFolder[]).filter((folder) => folder.scope === scope));
    request.onerror = () => reject(request.error);
  });
}

async function writeGalleryFolder(folder: GalleryFolder) {
  const database = await openGalleryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("folders", "readwrite");
    transaction.objectStore("folders").put(folder);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteGalleryFolder(folder: GalleryFolder) {
  const database = await openGalleryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["folders", "media"], "readwrite");
    const mediaStore = transaction.objectStore("media");
    const request = mediaStore.getAll();
    request.onsuccess = () => {
      for (const item of request.result as GalleryItem[]) {
        if (item.folderId === folder.id) {
          mediaStore.put({ ...item, folderId: undefined });
        }
      }
      transaction.objectStore("folders").delete(folder.id);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function writeGalleryItem(item: GalleryItem) {
  const database = await openGalleryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("media", "readwrite");
    transaction.objectStore("media").put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function deleteGalleryItem(id: string) {
  const database = await openGalleryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("media", "readwrite");
    transaction.objectStore("media").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function MediaPreview({ item }: { item: GalleryItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(item.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [item.blob]);

  if (!url) return <div className="gallery-preview-placeholder" />;
  return item.type === "image"
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="gallery-preview" src={url} alt={item.name} />
    : item.type === "video" ? <video className="gallery-preview" src={url} controls preload="metadata" aria-label={item.name} />
      : <div className="gallery-audio-preview"><Music2 size={28} /><strong title={item.name}>{item.name}</strong><audio src={url} controls preload="metadata" aria-label={item.name} /></div>;
}

export function Gallery({ storageScope }: { storageScope: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadedScope(null);
    setItems([]);
    Promise.all([readGallery(storageScope), readGalleryFolders(storageScope)]).then(([next, nextFolders]) => {
      if (!cancelled) {
        setItems(next.sort((a, b) => b.createdAt - a.createdAt));
        setFolders(nextFolders.sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedFolderId(null);
        setLoadedScope(storageScope);
        setError("");
      }
    }).catch(() => {
      if (!cancelled) {
        setItems([]);
        setLoadedScope(storageScope);
        setError("Gallery storage is unavailable in this browser.");
      }
    });
    return () => { cancelled = true; };
  }, [storageScope]);

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    const uploaded: GalleryItem[] = [];
    try {
      for (const file of files) {
        const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : null;
        if (!type) throw new Error(`${file.name} is not a supported photo, video, or audio file.`);
        const item: GalleryItem = {
          id: `${encodeURIComponent(storageScope)}:${crypto.randomUUID()}`,
          scope: storageScope,
          name: file.name,
          type,
          mimeType: file.type,
          createdAt: Date.now(),
          blob: file,
          ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
        };
        await writeGalleryItem(item);
        uploaded.push(item);
      }
      setItems((current) => [...uploaded.reverse(), ...current]);
    } catch (uploadError) {
      if (uploaded.length) setItems((current) => [...uploaded.reverse(), ...current]);
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload these files.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: GalleryItem) {
    try {
      await deleteGalleryItem(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setError("");
    } catch {
      setError(`Could not remove ${item.name}.`);
    }
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    const folder: GalleryFolder = { id: `${encodeURIComponent(storageScope)}:${crypto.randomUUID()}`, scope: storageScope, name, createdAt: Date.now() };
    try {
      await writeGalleryFolder(folder);
      setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedFolderId(folder.id);
      setFolderName("");
      setShowFolderForm(false);
      setError("");
    } catch {
      setError("Could not create this folder.");
    }
  }

  async function removeFolder(folder: GalleryFolder) {
    try {
      await deleteGalleryFolder(folder);
      setFolders((current) => current.filter((item) => item.id !== folder.id));
      if (selectedFolderId === folder.id) setSelectedFolderId(null);
      setItems((current) => current.map((item) => item.folderId === folder.id ? { ...item, folderId: undefined } : item));
      setError("");
    } catch {
      setError(`Could not remove ${folder.name}.`);
    }
  }

  const visibleItems = useMemo(() => items.filter((item) => !selectedFolderId || item.folderId === selectedFolderId), [items, selectedFolderId]);
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;

  return (
    <section className="gallery-section" aria-label="Gallery">
      <header className="gallery-heading">
        <div><p className="gallery-eyebrow">Your collection</p><h2>Gallery</h2><p>Keep photos, videos, and audio together in one place.</p></div>
        <input ref={inputRef} className="sr-only" type="file" accept="image/*,video/*,audio/*" multiple onChange={uploadFiles} aria-label="Choose photos, videos, and audio" />
        <div className="gallery-heading-actions">
          <button type="button" className="planit-secondary-button" onClick={() => setShowFolderForm((visible) => !visible)}><FolderPlus size={16} /> New folder</button>
          <button type="button" className="planit-primary-button" onClick={() => inputRef.current?.click()} disabled={busy || loadedScope !== storageScope}><Upload size={16} /> {busy ? "Uploading…" : "Upload media"}</button>
        </div>
      </header>

      {showFolderForm && <form className="gallery-folder-form" onSubmit={createFolder}><label className="sr-only" htmlFor="gallery-folder-name">Folder name</label><input id="gallery-folder-name" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Name this folder" maxLength={80} required /><button type="submit" className="planit-primary-button" disabled={!folderName.trim()}>Create folder</button></form>}

      <nav className="gallery-folder-tabs" aria-label="Gallery folders">
        <button type="button" className={!selectedFolderId ? "is-active" : ""} onClick={() => setSelectedFolderId(null)} aria-pressed={!selectedFolderId}>All media</button>
        {folders.map((folder) => <div className="gallery-folder-tab" key={folder.id}><button type="button" className={selectedFolderId === folder.id ? "is-active" : ""} onClick={() => setSelectedFolderId(folder.id)} aria-pressed={selectedFolderId === folder.id}>{folder.name}</button><button type="button" onClick={() => void removeFolder(folder)} aria-label={`Delete ${folder.name} folder`} title="Delete folder; keep its media in All media"><Trash2 size={13} /></button></div>)}
      </nav>

      {error && <p className="gallery-error" role="status">{error}</p>}
      {visibleItems.length ? (
        <div className="gallery-grid">
          {visibleItems.map((item) => (
            <article className="gallery-item" key={item.id}>
              <MediaPreview item={item} />
              <div className="gallery-item-caption">
                <span className="gallery-item-type">{item.type === "image" ? <ImagePlus size={13} /> : item.type === "video" ? <Video size={13} /> : <Music2 size={13} />}{item.type}</span>
                <strong title={item.name}>{item.name}</strong>
                <button type="button" onClick={() => void removeItem(item)} aria-label={`Delete ${item.name}`} title="Delete"><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <button type="button" className="gallery-empty" onClick={() => inputRef.current?.click()} disabled={busy || loadedScope !== storageScope}>
          <span><ImagePlus size={23} /></span><strong>{selectedFolder ? `${selectedFolder.name} is empty` : "Your gallery is empty"}</strong><small>Add photos, videos, or audio from this device.</small>
        </button>
      )}
    </section>
  );
}

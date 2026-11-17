"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, ExternalLink, Eye, Palette, Save } from "lucide-react";
import {
  DEFAULT_PORTFOLIO_PROFILE,
  PORTFOLIO_STORAGE_KEY,
  PORTFOLIO_THEMES,
  readPortfolioProfile,
  type PortfolioProfile,
  type PortfolioThemeId,
} from "@/lib/portfolio-data";

const LIST_FIELDS: { key: keyof Pick<PortfolioProfile, "experience" | "education" | "skills" | "projects" | "certifications" | "achievements">; label: string; placeholder: string }[] = [
  { key: "experience", label: "Professional experience", placeholder: "Product designer — Example Co. — 2023–present — Led a redesign that improved…" },
  { key: "education", label: "Education", placeholder: "BSc Computer Science — Example University — 2020–2024 — Focused on…" },
  { key: "skills", label: "Technical skills", placeholder: "TypeScript\nReact\nFigma" },
  { key: "projects", label: "Projects", placeholder: "Kiroku — A personal planning app — Next.js, React — https://example.com" },
  { key: "certifications", label: "Certifications", placeholder: "Cloud Practitioner — Example Academy — 2025" },
  { key: "achievements", label: "Achievements", placeholder: "Hackathon finalist — Selected from 200 teams" },
];

export function PortfolioEditor() {
  const [profile, setProfile] = useState<PortfolioProfile>(DEFAULT_PORTFOLIO_PROFILE);
  const [theme, setTheme] = useState<PortfolioThemeId>("editorial");
  const [slug, setSlug] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Loading…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function restorePortfolio() {
      const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      const restored = readPortfolioProfile(raw);
      let localSlug = "";
      try {
        const localRecord = raw ? JSON.parse(raw) as { slug?: unknown } : null;
        if (typeof localRecord?.slug === "string") localSlug = localRecord.slug;
      } catch { /* Ignore malformed local preview data. */ }
      if (restored) {
        setProfile(restored.profile);
        setTheme(restored.theme);
      }
      setSlug(localSlug);
      try {
        const response = await fetch("/api/portfolio", { cache: "no-store" });
        if (response.ok) {
          const remote = await response.json() as { profile: PortfolioProfile; theme: PortfolioThemeId; slug: string; saved: boolean };
          const saved = readPortfolioProfile(JSON.stringify(remote));
          if (saved && (remote.saved || !restored)) {
            setProfile(saved.profile);
            setTheme(saved.theme);
          }
          if (typeof remote.slug === "string") setSlug(remote.slug);
          setRemoteEnabled(true);
          setSyncStatus(remote.saved ? "Published" : "Connected");
        } else {
          setSyncStatus("Local preview");
        }
      } catch {
        setSyncStatus("Local preview");
      }
      if (!cancelled) setLoaded(true);
    }
    void restorePortfolio();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify({ profile, theme, slug }));
      window.dispatchEvent(new Event("planit-portfolio-updated"));
    } catch { /* The editor remains usable for this session when local storage is full. */ }
    if (!remoteEnabled) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 48) {
      setSyncStatus("Use 3–48 lowercase letters, numbers, or single hyphens for your address");
      return;
    }
    setSyncStatus("Saving…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch("/api/portfolio", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile, theme, slug }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || "Could not publish your latest changes");
        }
        setSyncStatus("Published");
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSyncStatus(error instanceof Error ? error.message : "Could not publish your latest changes");
      });
    }, 450);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loaded, profile, remoteEnabled, slug, theme]);

  function setText(key: keyof Pick<PortfolioProfile, "name" | "role" | "location" | "intro" | "about" | "email" | "github" | "linkedin" | "resumeHref">, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function setList(key: (typeof LIST_FIELDS)[number]["key"], value: string) {
    setProfile((current) => ({ ...current, [key]: value.split("\n").map((line) => line.trim()).filter(Boolean) }));
  }

  async function copyPublicUrl() {
    if (!remoteEnabled || !slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portfolio/${slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { setSyncStatus("Could not copy the public link in this browser"); }
  }

  const portfolioHref = remoteEnabled && slug ? `/portfolio/${slug}` : "/portfolio";

  return (
    <section className="portfolio-editor" aria-label="Edit public portfolio">
      <header className="portfolio-editor-header">
        <div><h2>Portfolio</h2></div>
        <div className="portfolio-editor-actions"><span className={`portfolio-editor-save-status ${remoteEnabled ? "is-published" : "is-local"}`}><Check size={14} /> {syncStatus}</span><Link className="planit-secondary-button" href={portfolioHref} target="_blank" rel="noreferrer"><Eye size={16} /> View public page <ExternalLink size={13} /></Link>{remoteEnabled && <button type="button" className="portfolio-copy-link" onClick={copyPublicUrl}><Copy size={14} /> {copied ? "Copied" : "Copy public link"}</button>}</div>
      </header>

      <div className="portfolio-editor-panel portfolio-address-panel">
        <label><span>Public page address</span><div><strong>/portfolio/</strong><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-").replace(/^-+/, ""))} maxLength={48} placeholder="your-name" /></div></label>

      </div>

      <div className="portfolio-editor-panel">
        <div className="portfolio-editor-panel-heading"><span><Palette size={17} /> Choose a design</span></div>
        <div className="portfolio-theme-grid">
          {PORTFOLIO_THEMES.map((option) => (
            <button key={option.id} type="button" onClick={() => setTheme(option.id)} className={`portfolio-theme-option ${theme === option.id ? "is-selected" : ""}`} aria-pressed={theme === option.id}>
              <span className={`portfolio-theme-preview theme-preview-${option.id}`}><i /><i /><i /><b /></span>
              <span className="portfolio-theme-details"><strong>{option.name}</strong><small>{option.description}</small></span>
              {theme === option.id && <span className="portfolio-theme-check"><Check size={13} /></span>}
            </button>
          ))}
        </div>
      </div>

      <div className="portfolio-editor-panel">
        <div className="portfolio-editor-panel-heading"><span><Save size={17} /> Profile and contact</span></div>
        <div className="portfolio-editor-fields">
          <label><span>Name</span><input value={profile.name} onChange={(event) => setText("name", event.target.value)} placeholder="Your name" /></label>
          <label><span>Professional title</span><input value={profile.role} onChange={(event) => setText("role", event.target.value)} placeholder="Your role and focus" /></label>
          <label><span>Location</span><input value={profile.location} onChange={(event) => setText("location", event.target.value)} placeholder="City, country" /></label>
          <label><span>Contact email</span><input type="email" value={profile.email} onChange={(event) => setText("email", event.target.value)} placeholder="name@example.com" /></label>
          <label><span>GitHub URL</span><input type="url" value={profile.github} onChange={(event) => setText("github", event.target.value)} placeholder="https://github.com/you" /></label>
          <label><span>LinkedIn URL</span><input type="url" value={profile.linkedin} onChange={(event) => setText("linkedin", event.target.value)} placeholder="https://linkedin.com/in/you" /></label>
          <label><span>Résumé file path</span><input value={profile.resumeHref} onChange={(event) => setText("resumeHref", event.target.value)} placeholder="/resume.pdf" /></label>

          <label className="is-wide"><span>Short introduction</span><textarea rows={3} value={profile.intro} onChange={(event) => setText("intro", event.target.value)} placeholder="A short introduction visitors will see first" /></label>
          <label className="is-wide"><span>About me</span><textarea rows={5} value={profile.about} onChange={(event) => setText("about", event.target.value)} placeholder="Your background, interests, and professional story" /></label>
        </div>
      </div>

      <div className="portfolio-editor-panel">
        <div className="portfolio-editor-panel-heading"><span><ArrowUpRight size={17} /> Your work and background</span></div>
        <div className="portfolio-editor-lists">
          {LIST_FIELDS.map((field) => (
            <label key={field.key}><span>{field.label}</span><textarea rows={field.key === "skills" ? 5 : 4} value={profile[field.key].join("\n")} onChange={(event) => setList(field.key, event.target.value)} placeholder={field.placeholder} /></label>
          ))}
        </div>
      </div>
    </section>
  );
}

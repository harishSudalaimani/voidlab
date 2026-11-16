"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Award,
  BriefcaseBusiness,
  Code2,
  GraduationCap,
  Mail,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  DEFAULT_PORTFOLIO_PROFILE,
  PORTFOLIO_STORAGE_KEY,
  readPortfolioProfile,
  type PortfolioProfile,
  type PortfolioThemeId,
} from "@/lib/portfolio-data";

function PortfolioEmpty({ children }: { children: string }) {
  return <p className="portfolio-empty">{children}</p>;
}

function parseEntry(value: string) {
  const [title = value, subtitle = "", date = "", ...details] = value.split("—").map((part) => part.trim());
  return { title, subtitle, date, details: details.join(" — ") };
}

function safeWebUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeResumePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : safeWebUrl(value);
}

export function PortfolioPublicPage({
  initialProfile = DEFAULT_PORTFOLIO_PROFILE,
  initialTheme = "editorial",
  readBrowserPreview = true,
}: {
  initialProfile?: PortfolioProfile;
  initialTheme?: PortfolioThemeId;
  readBrowserPreview?: boolean;
}) {
  const [profile, setProfile] = useState<PortfolioProfile>(initialProfile);
  const [theme, setTheme] = useState<PortfolioThemeId>(initialTheme);

  useEffect(() => {
    if (!readBrowserPreview) return;
    const restore = () => {
      const saved = readPortfolioProfile(window.localStorage.getItem(PORTFOLIO_STORAGE_KEY));
      if (saved) {
        setProfile(saved.profile);
        setTheme(saved.theme);
      }
    };
    restore();
    window.addEventListener("storage", restore);
    window.addEventListener("planit-portfolio-updated", restore);
    return () => {
      window.removeEventListener("storage", restore);
      window.removeEventListener("planit-portfolio-updated", restore);
    };
  }, [readBrowserPreview]);

  const github = safeWebUrl(profile.github);
  const linkedin = safeWebUrl(profile.linkedin);
  const resume = safeResumePath(profile.resumeHref);

  return (
    <main className="public-portfolio" data-portfolio-theme={theme}>
      <div className="portfolio-grain" aria-hidden="true" />
      <header className="portfolio-nav">
        <a className="portfolio-mark" href="#top" aria-label={`${profile.name} home`}><span>{profile.name.slice(0, 1) || "P"}</span><strong>{profile.name}</strong></a>
        <nav aria-label="Portfolio navigation">
          <a href="#about">About</a><a href="#experience">Experience</a><a href="#projects">Projects</a><a href="#contact">Contact</a>
        </nav>
        <a className="portfolio-contact-link" href={profile.email ? `mailto:${profile.email}` : "#contact"}>Let’s talk <ArrowUpRight size={15} /></a>
      </header>

      <section className="portfolio-hero" id="top">
        <div className="portfolio-hero-copy">
          <span className="portfolio-kicker"><Sparkles size={14} /> PERSONAL PORTFOLIO</span>
          <h1>{profile.name}<span className="portfolio-period">.</span></h1>
          <p className="portfolio-role">{profile.role}</p>
          <p className="portfolio-intro">{profile.intro}</p>
          <div className="portfolio-hero-actions">
            <a className="portfolio-button-primary" href="#projects">Explore my work <ArrowDown size={16} /></a>
            {resume ? <a className="portfolio-button-quiet" href={resume} download>Download résumé <ArrowDown size={16} /></a> : <span className="portfolio-button-quiet portfolio-button-disabled">Résumé coming soon</span>}
          </div>
          <div className="portfolio-social-links">
            {github ? <a href={github} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a> : <span>GitHub link to be added</span>}
            <i aria-hidden="true" />
            {linkedin ? <a href={linkedin} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={14} /></a> : <span>LinkedIn link to be added</span>}
          </div>
        </div>
        <div className="portfolio-hero-art" aria-hidden="true">
          <div className="portfolio-art-orbit orbit-one" /><div className="portfolio-art-orbit orbit-two" />
          <div className="portfolio-art-core"><span>✳</span><small>IDEAS<br />IN MOTION</small></div>
          <div className="portfolio-art-tag tag-top">Curiosity <span>↗</span></div><div className="portfolio-art-tag tag-bottom">Craft <span>✳</span></div>
          <span className="portfolio-art-dot dot-one" /><span className="portfolio-art-dot dot-two" /><span className="portfolio-art-dot dot-three" />
        </div>
        <div className="portfolio-hero-meta"><span><MapPin size={14} /> {profile.location}</span><span>SCROLL TO EXPLORE <ArrowDown size={13} /></span><span>01 — 08</span></div>
      </section>

      <section className="portfolio-about portfolio-section" id="about">
        <div className="portfolio-section-label"><span>01</span> ABOUT ME</div>
        <div className="portfolio-about-content"><h2>Good work starts with <em>good questions.</em></h2><p>{profile.about}</p></div>
      </section>

      <section className="portfolio-section portfolio-experience" id="experience">
        <div className="portfolio-section-heading"><div><div className="portfolio-section-label"><span>02</span> EXPERIENCE</div><h2>Where I’ve made <em>an impact.</em></h2></div><BriefcaseBusiness size={22} /></div>
        {profile.experience.length ? <div className="portfolio-timeline">{profile.experience.map((entry, index) => { const item = parseEntry(entry); return <article className="portfolio-timeline-item" key={`${item.title}-${index}`}><div className="portfolio-timeline-date">{item.date}</div><div><h3>{item.title}</h3><p className="portfolio-item-subtitle">{item.subtitle}</p><p>{item.details}</p></div></article>; })}</div> : <PortfolioEmpty>Professional experience will appear here.</PortfolioEmpty>}
      </section>

      <section className="portfolio-section portfolio-education" id="education">
        <div className="portfolio-section-heading"><div><div className="portfolio-section-label"><span>03</span> EDUCATION</div><h2>Always <em>learning.</em></h2></div><GraduationCap size={23} /></div>
        {profile.education.length ? <div className="portfolio-card-grid">{profile.education.map((entry, index) => { const item = parseEntry(entry); return <article className="portfolio-info-card" key={`${item.title}-${index}`}><span>{item.date}</span><h3>{item.title}</h3><p>{item.subtitle}</p><small>{item.details}</small></article>; })}</div> : <PortfolioEmpty>Education and academic background will appear here.</PortfolioEmpty>}
      </section>

      <section className="portfolio-section portfolio-skills" id="skills">
        <div className="portfolio-section-label"><span>04</span> TOOLKIT</div><h2>Things I <em>work with.</em></h2>
        {profile.skills.length ? <div className="portfolio-skill-list">{profile.skills.map((skill, index) => <span key={`${skill}-${index}`}>{skill}</span>)}</div> : <PortfolioEmpty>Technical skills and tools will appear here.</PortfolioEmpty>}
      </section>

      <section className="portfolio-section portfolio-projects" id="projects">
        <div className="portfolio-section-heading"><div><div className="portfolio-section-label"><span>05</span> SELECTED WORK</div><h2>Ideas, made <em>real.</em></h2></div><Code2 size={22} /></div>
        {profile.projects.length ? <div className="portfolio-project-grid">{profile.projects.map((entry, index) => { const item = parseEntry(entry); const stack = item.date.split(",").map((part) => part.trim()).filter(Boolean); const href = safeWebUrl(item.details); return <article className="portfolio-project-card" key={`${item.title}-${index}`}><div className={`portfolio-project-art art-${index % 3}`}><span>0{index + 1}</span><Code2 size={29} /></div><div className="portfolio-project-copy"><h3>{item.title}{href && <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}><ArrowUpRight size={17} /></a>}</h3><p>{item.subtitle}</p><div>{stack.map((technology) => <span key={technology}>{technology}</span>)}</div></div></article>; })}</div> : <PortfolioEmpty>Projects and case studies will appear here.</PortfolioEmpty>}
      </section>

      <section className="portfolio-credentials">
        <div className="portfolio-credential-block"><div className="portfolio-section-heading"><div><div className="portfolio-section-label"><span>06</span> CERTIFICATIONS</div><h2>Credentials.</h2></div><Award size={21} /></div>{profile.certifications.length ? profile.certifications.map((entry, index) => { const item = parseEntry(entry); return <article className="portfolio-credential-row" key={`${item.title}-${index}`}><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><small>{item.date}</small></article>; }) : <PortfolioEmpty>Certifications will appear here.</PortfolioEmpty>}</div>
        <div className="portfolio-credential-block"><div className="portfolio-section-heading"><div><div className="portfolio-section-label"><span>07</span> ACHIEVEMENTS</div><h2>Milestones.</h2></div><Sparkles size={21} /></div>{profile.achievements.length ? profile.achievements.map((entry, index) => { const item = parseEntry(entry); return <article className="portfolio-credential-row" key={`${item.title}-${index}`}><div><strong>{item.title}</strong><span>{item.subtitle}</span></div></article>; }) : <PortfolioEmpty>Achievements and recognition will appear here.</PortfolioEmpty>}</div>
      </section>

      <section className="portfolio-contact" id="contact">
        <div><div className="portfolio-section-label"><span>08</span> GET IN TOUCH</div><h2>Have something <em>in mind?</em></h2><p>For opportunities, collaborations, or just to say hello.</p></div>
        {profile.email ? <a className="portfolio-contact-email" href={`mailto:${profile.email}`}><Mail size={17} /> {profile.email} <ArrowUpRight size={17} /></a> : <span className="portfolio-contact-email portfolio-contact-placeholder">Contact details will appear here</span>}
      </section>

      <footer className="portfolio-footer"><span>© {new Date().getFullYear()} {profile.name}</span><span>Designed with intention <i>✳</i></span></footer>
    </main>
  );
}

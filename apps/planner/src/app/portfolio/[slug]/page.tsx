import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortfolioPublicPage } from "@/components/portfolio-public-page";
import { readPortfolioProfile } from "@/lib/portfolio-data";
import { getPortfolioBySlug } from "@/lib/portfolio-store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const row = await getPortfolioBySlug(slug.toLowerCase());
  const saved = row ? readPortfolioProfile(JSON.stringify({ profile: row.profile, theme: row.theme })) : null;
  if (!saved) return { title: "Portfolio" };
  return { title: `${saved.profile.name} — Portfolio`, description: saved.profile.intro };
}

export default async function SharedPortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getPortfolioBySlug(slug.toLowerCase());
  if (!row) notFound();
  const saved = readPortfolioProfile(JSON.stringify({ profile: row.profile, theme: row.theme }));
  if (!saved) notFound();

  return <PortfolioPublicPage initialProfile={saved.profile} initialTheme={saved.theme} readBrowserPreview={false} />;
}

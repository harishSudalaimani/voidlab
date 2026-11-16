import "server-only";
import { queryOne } from "@/lib/db";

export type PortfolioRow = {
  owner_id: string;
  slug: string;
  profile: Record<string, unknown>;
  theme: string;
  updated_at: Date;
};

export function getPortfolioForOwner(ownerId: string) {
  return queryOne<PortfolioRow>(
    `SELECT owner_id, slug, profile, theme, updated_at
       FROM portfolio_profiles
      WHERE owner_id = $1`,
    [ownerId],
  );
}

export function getPortfolioBySlug(slug: string) {
  return queryOne<PortfolioRow>(
    `SELECT owner_id, slug, profile, theme, updated_at
       FROM portfolio_profiles
      WHERE slug = $1`,
    [slug],
  );
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAppContext } from "@/lib/context";
import { queryOne } from "@/lib/db";
import { ApiError, handleApiError, json, readJson } from "@/lib/http";
import { getPortfolioForOwner } from "@/lib/portfolio-store";
import { DEFAULT_PORTFOLIO_PROFILE } from "@/lib/portfolio-data";

const profileSchema = z.object({
  name: z.string().max(120),
  role: z.string().max(180),
  location: z.string().max(120),
  intro: z.string().max(1200),
  about: z.string().max(6000),
  email: z.string().max(254),
  github: z.string().max(500),
  linkedin: z.string().max(500),
  resumeHref: z.string().max(500),
  experience: z.array(z.string().max(1200)).max(40),
  education: z.array(z.string().max(1200)).max(30),
  skills: z.array(z.string().max(120)).max(100),
  projects: z.array(z.string().max(1600)).max(60),
  certifications: z.array(z.string().max(600)).max(50),
  achievements: z.array(z.string().max(1200)).max(50),
});

const portfolioSchema = z.object({
  slug: z.string().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  theme: z.enum(["editorial", "midnight", "cobalt", "atelier", "paper"]),
  profile: profileSchema,
});

function suggestedSlug(name: string, userId: string) {
  const namePart = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "portfolio";
  const idPart = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6);
  return `${namePart}-${idPart}`;
}

export async function GET() {
  try {
    const context = await getAppContext();
    if (!context) throw new ApiError("Sign in to manage your public portfolio", 401);
    const existing = await getPortfolioForOwner(context.user.id);
    return json({
      slug: existing?.slug ?? suggestedSlug(context.user.name, context.user.id),
      profile: existing?.profile ?? { ...DEFAULT_PORTFOLIO_PROFILE, name: context.user.name },
      theme: existing?.theme ?? "editorial",
      saved: Boolean(existing),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await getAppContext();
    if (!context) throw new ApiError("Sign in to publish your portfolio", 401);
    const input = portfolioSchema.parse(await readJson(request));
    const row = await queryOne<{ slug: string; updated_at: Date }>(
      `INSERT INTO portfolio_profiles (owner_id, slug, profile, theme, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())
       ON CONFLICT (owner_id) DO UPDATE SET
         slug = EXCLUDED.slug,
         profile = EXCLUDED.profile,
         theme = EXCLUDED.theme,
         updated_at = now()
       RETURNING slug, updated_at`,
      [context.user.id, input.slug, JSON.stringify(input.profile), input.theme],
    );
    return json({ slug: row?.slug ?? input.slug, saved: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return json({ error: "That public address is already in use. Try another one." }, 409);
    }
    return handleApiError(error);
  }
}

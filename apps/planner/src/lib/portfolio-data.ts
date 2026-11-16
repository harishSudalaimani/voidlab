export type PortfolioThemeId = "editorial" | "midnight" | "cobalt" | "atelier" | "paper";

export type PortfolioProfile = {
  name: string;
  role: string;
  location: string;
  intro: string;
  about: string;
  email: string;
  github: string;
  linkedin: string;
  resumeHref: string;
  experience: string[];
  education: string[];
  skills: string[];
  projects: string[];
  certifications: string[];
  achievements: string[];
};

export const PORTFOLIO_STORAGE_KEY = "planit-public-portfolio-v1";

export const DEFAULT_PORTFOLIO_PROFILE: PortfolioProfile = {
  name: "Your Name",
  role: "Your role · Your area of focus",
  location: "Your city, country",
  intro: "A short introduction about who you are, what you do, and the kind of work you enjoy.",
  about: "Write a few sentences about your professional background, interests, and what you are looking to do next.",
  email: "",
  github: "",
  linkedin: "",
  resumeHref: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  achievements: [],
};

export const PORTFOLIO_THEMES: { id: PortfolioThemeId; name: string; description: string; colors: [string, string, string] }[] = [
  { id: "editorial", name: "Sunday Edition", description: "Sunny magazine pages, punchy coral, and expressive serif.", colors: ["#fff6e8", "#1b827b", "#eb5d4f"] },
  { id: "midnight", name: "After Hours", description: "Cool neon on ink, soft glass cards, and glowing color.", colors: ["#11121f", "#6dffe0", "#8aaaff"] },
  { id: "cobalt", name: "Studio Pop", description: "Electric blue, sharp grids, and graphic shapes.", colors: ["#eff3ff", "#315bff", "#ff6a36"] },
  { id: "atelier", name: "Color Atelier", description: "Peach canvas, plum lettering, and artful flourishes.", colors: ["#ffefd9", "#392137", "#d54576"] },
  { id: "paper", name: "Fresh Cut", description: "Crisp mint-white, vivid pink, and clean modern type.", colors: ["#f4fff9", "#087d63", "#ff4678"] },
];

export function readPortfolioProfile(raw: string | null): { profile: PortfolioProfile; theme: PortfolioThemeId } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { profile?: Partial<PortfolioProfile>; theme?: PortfolioThemeId };
    if (!parsed.profile || typeof parsed.profile !== "object") return null;
    const profile = { ...DEFAULT_PORTFOLIO_PROFILE };
    for (const key of Object.keys(profile) as (keyof PortfolioProfile)[]) {
      const value = parsed.profile[key];
      if (typeof profile[key] === "string" && typeof value === "string") {
        (profile[key] as string) = value;
      } else if (Array.isArray(profile[key]) && Array.isArray(value)) {
        (profile[key] as string[]) = value.filter((entry): entry is string => typeof entry === "string");
      }
    }
    const theme = PORTFOLIO_THEMES.some((option) => option.id === parsed.theme) ? parsed.theme! : "editorial";
    return { profile, theme };
  } catch {
    return null;
  }
}

import type { Metadata } from "next";
import { PortfolioPublicPage } from "@/components/portfolio-public-page";

export const metadata: Metadata = {
  title: "Persona",
  description: "A personal profile page.",
};

export default function PortfolioPage() {
  return <PortfolioPublicPage />;
}

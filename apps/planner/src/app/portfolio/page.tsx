import type { Metadata } from "next";
import { PortfolioPublicPage } from "@/components/portfolio-public-page";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A professional portfolio page.",
};

export default function PortfolioPage() {
  return <PortfolioPublicPage />;
}

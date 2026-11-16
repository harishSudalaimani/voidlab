import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planit — Your personal planner",
  description: "Plan your days, keep study notes, and collect ideas for later.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

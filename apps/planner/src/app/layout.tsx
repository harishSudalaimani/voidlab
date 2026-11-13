import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar — Yearly planner & bucket list",
  description:
    "Plan your year, track the milestones that matter and keep a bucket list you will actually finish. Secure sign-in with Auth0 and fine-grained access with OpenFGA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

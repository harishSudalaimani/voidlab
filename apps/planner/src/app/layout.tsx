import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#060913",
};

export const metadata: Metadata = {
  title: "Planit — Your personal planner",
  description: "Plan your days, keep study notes, and collect ideas for later.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Planit",
  },
  icons: {
    icon: [
      { url: "/planit-192.png", sizes: "192x192", type: "image/png" },
      { url: "/planit-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/planit-192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

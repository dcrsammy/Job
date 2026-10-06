import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { site } from "@/lib/config";
import "./globals.css";

const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.name}: find jobs you fit`, template: `%s · ${site.name}` },
  description: site.description,
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a2a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={schibsted.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

import { SiteShell } from "@/components/layout/site-shell";

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-heading-family",
  fallback: ["system-ui", "sans-serif"],
});

const interBody = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-body-family",
  fallback: ["system-ui", "sans-serif"],
});

const jetBrainsMono = JetBrains_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono-family",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "SceneDeck | The intelligence layer for cinema",
    template: "%s | SceneDeck",
  },
  description:
    "SceneDeck is a searchable database of cinema shots with structured camera movement metadata, verification workflows, and playback-aware analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${interBody.variable} ${jetBrainsMono.variable} antialiased`}
      >
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}

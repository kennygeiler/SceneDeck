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
  metadataBase: new URL("https://scenedeck-demo.vercel.app"),
  title: {
    default: "SceneDeck — The Intelligence Layer for Cinema",
    template: "%s | SceneDeck",
  },
  description:
    "A searchable database of film scenes tagged with camera motion metadata",
  openGraph: {
    title: "SceneDeck — The Intelligence Layer for Cinema",
    description:
      "A searchable database of film scenes tagged with camera motion metadata",
    url: "/",
    siteName: "SceneDeck",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "SceneDeck — The Intelligence Layer for Cinema",
    description:
      "A searchable database of film scenes tagged with camera motion metadata",
  },
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "64x64" },
      { url: "/favicon.ico" },
    ],
  },
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

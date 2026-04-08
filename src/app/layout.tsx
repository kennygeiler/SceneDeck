import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@/styles/globals.css";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://metrovision.vercel.app"),
  title: {
    default: "MetroVision — The Motion Intelligence Archive",
    template: "%s | MetroVision",
  },
  description:
    "A searchable archive of film shots with composition metadata, semantic tags, and human verification hooks.",
  openGraph: {
    title: "MetroVision — The Motion Intelligence Archive",
    description:
      "A searchable archive of film shots with composition metadata, semantic tags, and human verification hooks.",
    url: "/",
    siteName: "MetroVision",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MetroVision — The Motion Intelligence Archive",
    description:
      "A searchable archive of film shots with composition metadata, semantic tags, and human verification hooks.",
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
        {children}
      </body>
    </html>
  );
}

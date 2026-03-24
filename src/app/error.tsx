"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorPageProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function GlobalError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 18% 20%, color-mix(in oklch, var(--color-status-error) 18%, transparent) 0%, transparent 26%), radial-gradient(circle at 82% 18%, color-mix(in oklch, var(--color-overlay-trajectory) 14%, transparent) 0%, transparent 24%), linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 26%, transparent), transparent 46%)",
            }}
          />

          <motion.section
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="relative w-full max-w-3xl rounded-[calc(var(--radius-xl)_+_8px)] border p-8 shadow-[var(--shadow-xl)] sm:p-10"
            style={{
              background:
                "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 90%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 76%, transparent)",
            }}
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <div
                  className="inline-flex size-12 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--color-status-error) 16%, transparent)",
                    borderColor:
                      "color-mix(in oklch, var(--color-status-error) 42%, transparent)",
                  }}
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="size-5 text-[var(--color-text-primary)]"
                  />
                </div>
                <p className="mt-6 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Runtime interruption
                </p>
                <h1
                  className="mt-3 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Something went wrong
                </h1>
                <p className="mt-4 max-w-xl text-base leading-8 text-[var(--color-text-secondary)]">
                  MetroVision hit an unexpected rendering failure. Retry the request,
                  or return to the live archive while the current route resets.
                </p>
              </div>

              <div
                className="rounded-[var(--radius-lg)] border px-4 py-3 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 62%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                }}
              >
                System boundary
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                className="rounded-full px-5 shadow-[var(--shadow-glow)]"
                onClick={reset}
              >
                <RefreshCcw aria-hidden="true" />
                Retry
              </Button>
              <Link
                href="/browse"
                className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-border-default)] px-5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
              >
                Back to browse
              </Link>
            </div>
          </motion.section>
        </main>
      </body>
    </html>
  );
}

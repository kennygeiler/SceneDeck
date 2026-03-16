import type { ReactNode } from "react";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top left, color-mix(in oklch, var(--color-accent-base) 16%, transparent) 0%, transparent 34%), radial-gradient(circle at 80% 20%, color-mix(in oklch, var(--color-signal-violet) 12%, transparent) 0%, transparent 28%)",
        }}
      />
      <SiteHeader />
      <main className="relative px-4 pb-16 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
      <footer className="relative border-t border-[var(--color-border-subtle)] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 text-sm text-[var(--color-text-secondary)]">
          <p>SceneDeck. Structured intelligence for cinema shots.</p>
          <Link
            href="/browse"
            className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
          >
            Browse Archive
          </Link>
        </div>
      </footer>
    </div>
  );
}

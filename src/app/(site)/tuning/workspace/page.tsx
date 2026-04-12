import type { Metadata } from "next";
import Link from "next/link";

import { TuningWorkspace } from "@/components/tuning/tuning-workspace";
import { getAllFilms } from "@/db/queries";

export const metadata: Metadata = {
  title: "Boundary tuning workspace",
  description:
    "Global cut presets, human verified cuts revision history, worker detect, and eval runs.",
};

export default async function TuningWorkspacePage() {
  const films = await getAllFilms();
  const options = films.map((f) => ({
    id: f.id,
    title: f.title,
    director: f.director,
    year: f.year,
  }));

  return (
    <div className="space-y-8 pb-16">
      <div>
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Phase 10
        </p>
        <h1
          className="mt-2 text-3xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Tuning workspace
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
          Boundary-cut presets live in the <strong>shared database</strong>. Community contributions (and system
          baselines) appear on <Link href="/ingest" className="text-[var(--color-text-accent)] underline">ingest</Link>
          . Human verified cuts are <strong>versioned</strong> revisions. Run detection on the{" "}
          <strong>TS worker</strong> (not Vercel), then score against DB-backed human verified cuts. For the guided
          flow, use{" "}
          <Link href="/community/prep" className="text-[var(--color-text-accent)] underline">
            community prep
          </Link>
          .
        </p>
        <p className="mt-4">
          <a
            href="/tuning"
            className="text-sm text-[var(--color-text-accent)] underline"
          >
            ← Canonical Ran profile / docs
          </a>
        </p>
      </div>

      <TuningWorkspace films={options} />
    </div>
  );
}

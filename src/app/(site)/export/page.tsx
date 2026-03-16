import type { Metadata } from "next";

import { ExportPanel } from "@/components/export/export-panel";
import { getShotsForExport } from "@/db/queries";

export const metadata: Metadata = {
  title: "Export",
  description:
    "Export SceneDeck shot metadata as JSON or CSV with dataset preview and filter controls.",
};

export default async function ExportPage() {
  const shots = await getShotsForExport();
  const availableDirectors = Array.from(
    new Set(shots.map((shot) => shot.director)),
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Archive export
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Ship SceneDeck metadata into analysis workflows
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            Export the live shot archive as structured JSON or flat CSV,
            narrowed by the same archive filters used across browse surfaces.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <article
            className="rounded-[var(--radius-xl)] border p-5"
            style={{
              background:
                "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 98%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              JSON export
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--color-text-primary)]">
              Pretty-printed records
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              Best for ETL, scripts, validation, and preserving typed field
              values in a single payload.
            </p>
          </article>

          <article
            className="rounded-[var(--radius-xl)] border p-5"
            style={{
              background:
                "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 98%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              CSV export
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--color-text-primary)]">
              Flat analysis sheet
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              Best for spreadsheets, reporting, bulk review, and lightweight
              downstream joins.
            </p>
          </article>
        </div>
      </section>

      <ExportPanel shots={shots} availableDirectors={availableDirectors} />
    </div>
  );
}

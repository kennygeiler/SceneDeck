import type { Metadata } from "next";

import { ExportCitationPanel } from "@/components/export/export-citation-panel";
import { ExportPanel } from "@/components/export/export-panel";
import {
  getShotById,
  getShotsForExport,
  getVerificationStats,
} from "@/db/queries";
import { FRAMINGS } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Export",
  description:
    "Export composition metadata (JSON/CSV) from the MetroVision archive with a ready-made citation.",
};

function siteOrigin() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (base) return base;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

type ExportPageProps = {
  searchParams?: Promise<{ demoShot?: string }>;
};

export default async function ExportPage({ searchParams }: ExportPageProps) {
  const sp = searchParams ? await searchParams : {};
  const demoId = sp.demoShot?.trim() || null;

  const [shots, stats, demoShot] = await Promise.all([
    getShotsForExport(),
    getVerificationStats(),
    demoId ? getShotById(demoId) : Promise.resolve(null),
  ]);

  const availableDirectors = Array.from(
    new Set(shots.map((shot) => shot.director)),
  ).sort((left, right) => left.localeCompare(right));

  const framingTypeCount = Object.keys(FRAMINGS).length;

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
            Citable composition extracts
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            Pull JSON or CSV from the live archive for analysis, then paste the
            citation block into papers or READMEs. Optional query{" "}
            <span className="font-mono text-sm text-[var(--color-text-primary)]">
              ?demoShot=(shot id)
            </span>{" "}
            anchors the citation to one record.
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
              Typed records
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              Scripts, validation, and pipelines—full field fidelity.
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
              Flat tables
            </p>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
              Spreadsheets and quick joins across filters.
            </p>
          </article>
        </div>
      </section>

      <ExportCitationPanel
        stats={stats}
        framingTypeCount={framingTypeCount}
        siteOrigin={siteOrigin()}
        demoShotId={demoShot?.id ?? null}
        demoFilmTitle={demoShot?.film.title ?? null}
        demoDirector={demoShot?.film.director ?? null}
      />

      <ExportPanel shots={shots} availableDirectors={availableDirectors} />
    </div>
  );
}

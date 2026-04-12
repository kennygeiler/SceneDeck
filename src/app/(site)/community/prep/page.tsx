import type { Metadata } from "next";
import Link from "next/link";

import { CommunityPrepWizard } from "@/components/community/community-prep-wizard";
import { getAllFilms } from "@/db/queries";

export const metadata: Metadata = {
  title: "Community boundary prep",
  description:
    "Tune shot-boundary detection against human verified cuts, get LLM insights, and publish presets for everyone.",
};

export default async function CommunityPrepPage() {
  const films = await getAllFilms();
  const options = films.map((f) => ({
    id: f.id,
    title: f.title,
    director: f.director,
    year: f.year,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <div>
        <Link
          href="/ingest"
          className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
        >
          &larr; Ingest
        </Link>
        <p className="mt-4 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Community space
        </p>
        <h1
          className="mt-2 text-3xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Prep before ingest
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
          When someone validates a boundary preset on strong human verified cuts and publishes it, the profile is stored
          in the <strong>shared library</strong> — the same way a great Cursor model setting helps every teammate. You can
          still keep a duplicate private if you uncheck community sharing.
        </p>
      </div>

      <CommunityPrepWizard films={options} />
    </div>
  );
}

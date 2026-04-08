import type { Metadata } from "next";
import { Suspense } from "react";

import { GoldAnnotateWorkspace } from "@/components/eval/gold-annotate-workspace";
import { getAllFilms } from "@/db/queries";

export const metadata: Metadata = {
  title: "Gold eval annotation",
  description:
    "Internal session for annotating ground-truth shot cuts; bookmark URL to resume. Not indexed.",
  robots: { index: false, follow: false },
};

export default async function GoldAnnotatePage() {
  const films = await getAllFilms();

  return (
    <Suspense
      fallback={
        <div className="py-16 font-mono text-sm text-[var(--color-text-tertiary)]">
          Loading session…
        </div>
      }
    >
      <GoldAnnotateWorkspace films={films} />
    </Suspense>
  );
}

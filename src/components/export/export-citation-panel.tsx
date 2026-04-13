"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExportCitationPanelProps = {
  framingTypeCount: number;
  siteOrigin: string;
  demoShotId: string | null;
  demoFilmTitle: string | null;
  demoDirector: string | null;
};

export function ExportCitationPanel({
  framingTypeCount,
  siteOrigin,
  demoShotId,
  demoFilmTitle,
  demoDirector,
}: ExportCitationPanelProps) {
  const [copied, setCopied] = useState(false);

  const citation = useMemo(() => {
    const retrieved = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());

    const record =
      demoShotId && demoFilmTitle
        ? `Shot record "${demoFilmTitle}" (${demoDirector ?? "Unknown director"}), id ${demoShotId}, ${siteOrigin}/shot/${demoShotId}. `
        : `MetroVision shot archive export, ${siteOrigin}. `;

    return (
      `${record}` +
      `Retrieved ${retrieved}. ` +
      `Composition taxonomy includes ${framingTypeCount} framing types and related fields (depth, blocking, lighting, shot size, angles). ` +
      "Labels are primarily model-assist; exports include classification_source and related provenance fields."
    );
  }, [demoDirector, demoFilmTitle, demoShotId, framingTypeCount, siteOrigin]);

  async function handleCopy() {
    await navigator.clipboard.writeText(citation);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      className="rounded-[var(--radius-xl)] border p-6"
      style={{
        background:
          "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Citation &amp; methodology
          </p>
          <h2
            className="mt-3 text-xl font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Copy for papers or READMEs
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-7 text-[var(--color-text-secondary)]">
            Plain-text citation referencing this deployment and the composition
            taxonomy. Adjust wording to match your style guide.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 rounded-full border-[var(--color-border-default)]",
          )}
        >
          {copied ? (
            <>
              <Check aria-hidden="true" className="size-4" />
              Copied
            </>
          ) : (
            <>
              <Copy aria-hidden="true" className="size-4" />
              Copy citation
            </>
          )}
        </button>
      </div>
      <pre
        className="mt-5 max-h-56 overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[color-mix(in_oklch,var(--color-surface-primary)_78%,transparent)] p-4 font-mono text-xs leading-6 text-[var(--color-text-secondary)] whitespace-pre-wrap"
        tabIndex={0}
      >
        {citation}
      </pre>
    </section>
  );
}

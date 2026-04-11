import type { Metadata } from "next";
import Link from "next/link";

const REPO_MAIN =
  "https://github.com/kennygeiler/MetroVision/blob/main" as const;

export const metadata: Metadata = {
  title: "Boundary tuning",
  description:
    "Canonical MetroVision shot-boundary tuning profile for Ran, CLI workflow, and eval evidence logs.",
};

function DocLink({ path, label }: { path: string; label: string }) {
  return (
    <a
      href={`${REPO_MAIN}/${path}`}
      className="font-mono text-sm text-[var(--color-text-accent)] underline decoration-[var(--color-border-default)] underline-offset-4 transition-colors hover:decoration-[var(--color-text-accent)]"
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

export default function TuningPage() {
  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Production profile
        </p>
        <h1
          className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Boundary tuning
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
          Canonical shot-boundary settings for Ran (validated on length-matched
          media and hand gold). Align the ingest worker env with this table
          before full-film runs. Composition and classification tuning are
          separate.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Cemented settings (2026-04-11)
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Locked after merge-gap and multi-knob sweeps; see evidence links below.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                <th className="pb-3 pr-4 font-medium">Knob</th>
                <th className="pb-3 pr-4 font-medium">Value</th>
                <th className="pb-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-primary)]">
              <tr className="border-b border-[var(--color-border-subtle)] align-top">
                <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-accent)]">
                  METROVISION_BOUNDARY_DETECTOR
                </td>
                <td className="py-3 pr-4 font-mono text-xs">
                  pyscenedetect_ensemble_pyscene
                </td>
                <td className="py-3 text-[var(--color-text-secondary)]">
                  Dual PyScene + merge. Single adaptive/content scored lower on
                  Ran gold.
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border-subtle)] align-top">
                <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-accent)]">
                  METROVISION_BOUNDARY_MERGE_GAP_SEC
                </td>
                <td className="py-3 pr-4 font-mono text-xs">0.22</td>
                <td className="py-3 text-[var(--color-text-secondary)]">
                  Dense hard-cut gold default; wider gaps did not change ensemble
                  cuts on Ran1243.
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border-subtle)] align-top">
                <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-accent)]">
                  Extras / fusion
                </td>
                <td className="py-3 pr-4 font-mono text-xs">
                  None + merge_flat
                </td>
                <td className="py-3 text-[var(--color-text-secondary)]">
                  No TransNet in baseline. Use{" "}
                  <span className="font-mono text-xs">merge_flat</span> when
                  adding <span className="font-mono text-xs">--extra-cuts</span>
                  .
                </td>
              </tr>
              <tr className="border-b border-[var(--color-border-subtle)] align-top">
                <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-accent)]">
                  Eval tolerance
                </td>
                <td className="py-3 pr-4 font-mono text-xs">0.5 s</td>
                <td className="py-3 text-[var(--color-text-secondary)]">
                  Primary F1 benchmark. Loosen only for reporting, not detector
                  quality.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-3 pr-4 font-mono text-xs text-[var(--color-text-accent)]">
                  Reference benchmark
                </td>
                <td className="py-3 pr-4 font-mono text-xs" colSpan={2}>
                  P ≈ 0.784 · R ≈ 0.817 · F1 = 0.80 (tol 0.5) vs{" "}
                  <span className="whitespace-nowrap">
                    gold-ran-2026-04-10.json
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Operator workflow
          </h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-[var(--color-text-secondary)]">
            <li>
              <Link
                href="/eval/gold-annotate"
                className="text-[var(--color-text-accent)] underline-offset-4 hover:underline"
              >
                Gold annotate
              </Link>{" "}
              — hand-cut instants
            </li>
            <li>
              <Link
                href="/ingest"
                className="text-[var(--color-text-accent)] underline-offset-4 hover:underline"
              >
                Ingest
              </Link>{" "}
              — full pipeline (worker env must match the table)
            </li>
            <li>
              CLI detect-only + metrics:{" "}
              <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                pnpm detect:export-cuts
              </span>
              ,{" "}
              <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                pnpm eval:pipeline
              </span>
            </li>
          </ul>
          <pre className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4 font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {`export METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene
export METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22
pnpm detect:export-cuts -- /path/to/Ran1243.mov --start 0 --end 780 \\
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \\
  --fusion-policy merge_flat --out eval/predicted/run.json`}
          </pre>
        </div>

        <div className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] p-6">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Evidence & logs (GitHub)
          </h2>
          <ul className="space-y-3 text-sm text-[var(--color-text-secondary)]">
            <li>
              <DocLink path="eval/runs/STATUS.md" label="eval/runs/STATUS.md" />{" "}
              — living baseline + CEMENTED section
            </li>
            <li>
              <DocLink
                path="eval/runs/ran1243-knob-sweep-gap022-2026-04-11.md"
                label="Knob sweep summary"
              />{" "}
              +{" "}
              <DocLink
                path="eval/runs/ran1243-knob-sweep-gap022-2026-04-11.log"
                label=".log"
              />
            </li>
            <li>
              <DocLink
                path="eval/runs/ran1243-merge-gap-sweep-2026-04-11.md"
                label="Merge-gap sweep summary"
              />{" "}
              +{" "}
              <DocLink
                path="eval/runs/ran1243-merge-gap-sweep-2026-04-11.log"
                label=".log"
              />
            </li>
            <li>
              <DocLink path="docs/tuning-flow.md" label="docs/tuning-flow.md" />{" "}
              — staged workflow (CLI → product)
            </li>
          </ul>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Canonical S3 object:{" "}
            <span className="font-mono">
              s3://metrovision-superai/films/ran-1985/source/Ran1243.mov
            </span>
            . Use a fresh presigned URL to download; do not commit presigned
            links.
          </p>
        </div>
      </section>

      <section className="max-w-3xl rounded-2xl border border-dashed border-[var(--color-border-default)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Next product steps
        </h2>
        <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">
          In-app HITL boundary review and multi-film gold are roadmap Phases
          10–11 (see{" "}
          <DocLink path=".planning/ROADMAP.md" label=".planning/ROADMAP.md" />).
          This page documents the CLI and env contract until those ship.
        </p>
      </section>
    </div>
  );
}

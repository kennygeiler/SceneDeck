"use client";

import { useState } from "react";
import { Database, Download, FileJson2, FileSpreadsheet } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  EXPORT_SHOT_COLUMNS,
  triggerExportDownload,
  type ExportFormat,
} from "@/lib/export";
import {
  formatShotDuration,
  getFramingDisplayName,
} from "@/lib/shot-display";
import type { ExportShotRecord } from "@/lib/types";
import { FRAMINGS, type FramingSlug } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type ExportPanelProps = {
  shots: ExportShotRecord[];
  availableDirectors: string[];
};

const formatOptions: Array<{
  format: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileJson2;
}> = [
  {
    format: "json",
    label: "JSON",
    description: "Pretty-printed payload for pipelines and ingestion.",
    icon: FileJson2,
  },
  {
    format: "csv",
    label: "CSV",
    description: "Spreadsheet-ready rows with escaped flat values.",
    icon: FileSpreadsheet,
  },
];

export function ExportPanel({
  shots,
  availableDirectors,
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [framing, setFraming] = useState("all");
  const [director, setDirector] = useState("all");

  const filteredShots = shots.filter((shot) => {
    if (framing !== "all" && shot.framing !== framing) {
      return false;
    }

    if (director !== "all" && shot.director !== director) {
      return false;
    }

    return true;
  });
  const previewRows = filteredShots.slice(0, 3);

  function handleDownload() {
    triggerExportDownload(format, {
      framing: framing !== "all" ? framing : undefined,
      director: director !== "all" ? director : undefined,
    });
  }

  function handleDownloadWithManifest() {
    triggerExportDownload("json", {
      framing: framing !== "all" ? framing : undefined,
      director: director !== "all" ? director : undefined,
    }, { includeManifest: true });
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          background:
            "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Export configuration
            </p>
            <h2
              className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Build a portable metadata extract
            </h2>
          </div>

          <div
            className="min-w-40 rounded-[var(--radius-lg)] border px-4 py-3 text-right"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            <p className="font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Filtered rows
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
              {filteredShots.length}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              of {shots.length} total shots
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Format
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {formatOptions.map((option) => {
                const Icon = option.icon;
                const isActive = option.format === format;

                return (
                  <button
                    key={option.format}
                    type="button"
                    onClick={() => setFormat(option.format)}
                    className="rounded-[var(--radius-lg)] border p-4 text-left transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? "color-mix(in oklch, var(--color-accent-base) 12%, var(--color-surface-primary))"
                        : "color-mix(in oklch, var(--color-surface-primary) 70%, transparent)",
                      borderColor: isActive
                        ? "color-mix(in oklch, var(--color-accent-base) 56%, transparent)"
                        : "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full border"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--color-overlay-arrow) 14%, transparent)",
                          borderColor:
                            "color-mix(in oklch, var(--color-overlay-arrow) 44%, transparent)",
                        }}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4 text-[var(--color-text-primary)]" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {option.label}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Framing
              </span>
              <select
                value={framing}
                onChange={(event) => setFraming(event.target.value)}
                className="mt-3 h-11 w-full rounded-[var(--radius-lg)] border px-4 text-sm outline-none"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                  color: "var(--color-text-primary)",
                }}
              >
                <option value="all">All framing types</option>
                {Object.values(FRAMINGS).map((framingOption) => (
                  <option key={framingOption.slug} value={framingOption.slug}>
                    {framingOption.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Director
              </span>
              <select
                value={director}
                onChange={(event) => setDirector(event.target.value)}
                className="mt-3 h-11 w-full rounded-[var(--radius-lg)] border px-4 text-sm outline-none"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                  color: "var(--color-text-primary)",
                }}
              >
                <option value="all">All directors</option>
                {availableDirectors.map((directorOption) => (
                  <option key={directorOption} value={directorOption}>
                    {directorOption}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download {format.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={handleDownloadWithManifest}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "rounded-full border-[var(--color-border-default)] px-5",
            )}
          >
            <FileJson2 aria-hidden="true" className="h-4 w-4" />
            JSON + manifest
          </button>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Exports omit clip/poster URLs, storage file names, and model scene-grouping fields. Rows are one detected shot (
            <a
              href="https://github.com/kennygeiler/MetroVision/blob/main/.planning/research/pipeline-whitepaper.md"
              className="text-[var(--color-text-accent)] underline-offset-2 hover:underline"
            >
              whitepaper
            </a>
            ). JSON + manifest adds pipeline version, taxonomy hash, and per-film ingest provenance.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div
          className="rounded-[var(--radius-xl)] border p-5"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full border"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-signal-violet) 14%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-signal-violet) 40%, transparent)",
              }}
            >
              <Database aria-hidden="true" className="h-4 w-4 text-[var(--color-text-primary)]" />
            </span>
            <div>
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Preview window
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                First 3 rows from the active export selection
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
            <table className="min-w-full divide-y divide-[var(--color-border-subtle)]">
              <thead
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 84%, transparent)",
                }}
              >
                <tr className="text-left">
                  <th className="px-4 py-3 font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Film
                  </th>
                  <th className="px-4 py-3 font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Framing
                  </th>
                  <th className="px-4 py-3 font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewRows.length > 0 ? (
                  previewRows.map((shot) => (
                    <tr
                      key={shot.shotId}
                      className="border-t border-[var(--color-border-subtle)] align-top"
                    >
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {shot.filmTitle}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {shot.director}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-[var(--color-text-primary)]">
                          {getFramingDisplayName(
                            shot.framing as FramingSlug,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {shot.description ?? "No semantic description"}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-mono text-sm text-[var(--color-text-primary)]">
                          {formatShotDuration(shot.duration)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {shot.shotSize}
                        </p>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]"
                    >
                      No shots match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="rounded-[var(--radius-xl)] border p-5"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Export footprint
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] px-4 py-3">
              <p className="font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Columns
              </p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                {EXPORT_SHOT_COLUMNS.length}
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] px-4 py-3">
              <p className="font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Formats
              </p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                2
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] px-4 py-3">
              <p className="font-mono text-[0.7rem] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Active mode
              </p>
              <p className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                {format.toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

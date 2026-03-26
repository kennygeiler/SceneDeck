"use client";

import { useRef } from "react";
import { ChevronDown, Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { triggerExportDownload, type ExportFormat } from "@/lib/export";
import { cn } from "@/lib/utils";

type ExportButtonProps = {
  filters?: {
    framing?: string;
    director?: string;
    filmTitle?: string;
    shotSize?: string;
  };
  className?: string;
  label?: string;
};

const exportOptions: Array<{
  format: ExportFormat;
  label: string;
  description: string;
}> = [
  {
    format: "json",
    label: "Export as JSON",
    description: "Pretty-printed records for downstream tooling.",
  },
  {
    format: "csv",
    label: "Export as CSV",
    description: "Flat spreadsheet-ready metadata rows.",
  },
];

export function ExportButton({
  filters,
  className,
  label = "Export",
}: ExportButtonProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function handleExport(format: ExportFormat) {
    triggerExportDownload(format, filters);

    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  return (
    <details ref={detailsRef} className={cn("relative", className)}>
      <summary
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "list-none cursor-pointer rounded-full px-3 text-[var(--color-text-primary)] marker:hidden [&::-webkit-details-marker]:hidden",
        )}
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 80%, transparent)",
        }}
      >
        <Download aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
      </summary>

      <div
        className="absolute right-0 z-20 mt-2 w-64 rounded-[var(--radius-lg)] border p-2 shadow-[var(--shadow-xl)]"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 92%, transparent), color-mix(in oklch, var(--color-surface-primary) 98%, transparent))",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 76%, transparent)",
        }}
      >
        {exportOptions.map((option) => (
          <button
            key={option.format}
            type="button"
            onClick={() => handleExport(option.format)}
            className="flex w-full flex-col rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors hover:opacity-100"
            style={{
              backgroundColor: "transparent",
            }}
          >
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {option.label}
            </span>
            <span className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

type MethodologyBlurbProps = {
  framingTypeCount: number;
  className?: string;
};

export function MethodologyBlurb({ framingTypeCount, className }: MethodologyBlurbProps) {
  return (
    <div
      className={className}
      style={{
        background:
          "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
        Methodology (live archive)
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
        Shots carry a fixed composition taxonomy (for example{" "}
        <span className="text-[var(--color-text-primary)]">
          {framingTypeCount} framing types
        </span>
        ), plus depth, blocking, lighting, shot size, and angles. Labels are
        primarily model-assist; exports include{" "}
        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
          classification_source
        </span>{" "}
        and related fields for reproducible citations.
      </p>
    </div>
  );
}

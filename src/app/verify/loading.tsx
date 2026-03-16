import {
  SkeletonBar,
  SkeletonCircle,
} from "@/components/ui/loading-skeleton";

export default function VerifyLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl space-y-4">
          <SkeletonBar className="h-3 w-36" />
          <SkeletonBar className="h-12 w-64 max-w-full" />
          <SkeletonBar className="h-4 w-[42rem] max-w-full" />
        </div>
        <SkeletonBar className="h-7 w-28" />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[var(--radius-xl)] border p-5"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="mt-3 h-8 w-20" />
            <SkeletonBar className="mt-2 h-4 w-32" />
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-[var(--radius-xl)] border"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <div className="relative aspect-video overflow-hidden border-b border-[var(--color-border-subtle)] p-4">
              <div className="scene-skeleton absolute inset-0 rounded-none" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <SkeletonBar className="h-7 w-28" />
                <SkeletonBar className="h-7 w-24" />
              </div>
              <div className="relative mt-24 space-y-2 sm:mt-28">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="h-6 w-40" />
              </div>
            </div>

            <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((__, metricIndex) => (
                <div key={metricIndex}>
                  <SkeletonBar className="h-3 w-16" />
                  <div className="mt-2 flex items-center gap-2">
                    <SkeletonCircle className="size-4" />
                    <SkeletonBar className="h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

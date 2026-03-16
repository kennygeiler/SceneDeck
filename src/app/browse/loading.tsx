import {
  ShotCardSkeleton,
  SkeletonBar,
} from "@/components/ui/loading-skeleton";

export default function BrowseLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <section className="max-w-3xl space-y-4">
        <SkeletonBar className="h-3 w-24" />
        <SkeletonBar className="h-12 w-[34rem] max-w-full" />
        <SkeletonBar className="h-4 w-[42rem] max-w-full" />
        <SkeletonBar className="h-4 w-[36rem] max-w-full" />
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <div
              className="scene-skeleton h-9 w-9 rounded-full"
              aria-hidden="true"
            />
            <div className="space-y-2">
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="h-4 w-32" />
            </div>
          </div>
          <SkeletonBar className="h-7 w-24" />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            <SkeletonBar className="h-3 w-40" />
            <div className="mt-3 scene-skeleton h-11 rounded-full" aria-hidden="true" />
            <div className="mt-3 space-y-2">
              <SkeletonBar className="h-4 w-80 max-w-full" />
            </div>
          </div>

          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            <SkeletonBar className="h-3 w-28" />
            <div className="mt-3 space-y-3">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-4 w-28" />
              <SkeletonBar className="h-4 w-24" />
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <SkeletonBar className="h-3 w-24" />
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, pillIndex) => (
                  <SkeletonBar key={pillIndex} className="h-7 w-24" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <ShotCardSkeleton key={index} />
        ))}
      </section>
    </div>
  );
}

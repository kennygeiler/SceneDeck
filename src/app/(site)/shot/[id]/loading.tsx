import {
  ShotPlayerSkeleton,
  SkeletonBar,
} from "@/components/ui/loading-skeleton";

export default function ShotDetailLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-live="polite">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl space-y-4">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-12 w-[28rem] max-w-full" />
          <SkeletonBar className="h-4 w-72 max-w-full" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBar className="h-7 w-28" />
          <SkeletonBar className="h-7 w-28" />
        </div>
      </section>

      <ShotPlayerSkeleton />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div
          className="rounded-[var(--radius-xl)] border p-6"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <SkeletonBar className="h-3 w-28" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
                }}
              >
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="mt-3 h-4 w-28" />
              </div>
            ))}
          </div>
        </div>

        <aside
          className="rounded-[var(--radius-xl)] border p-6"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <SkeletonBar className="h-3 w-24" />
          <div className="mt-4 space-y-3">
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-full" />
            <SkeletonBar className="h-4 w-5/6" />
          </div>
          <div
            className="mt-4 rounded-[var(--radius-lg)] border p-4"
            style={{
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
            }}
          >
            <div className="space-y-3">
              <SkeletonBar className="h-4 w-full" />
              <SkeletonBar className="h-4 w-11/12" />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

import { Skeleton, SkeletonBar } from "@/components/ui/loading-skeleton";

export default function FilmDetailLoading() {
  return (
    <div className="space-y-10 pb-16">
      {/* Back nav */}
      <SkeletonBar className="h-3 w-24" />

      {/* Film Header skeleton */}
      <div
        className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] p-8"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
        }}
      >
        <div className="flex gap-8">
          <Skeleton className="hidden h-72 w-48 shrink-0 rounded-[var(--radius-lg)] sm:block" />
          <div className="flex-1 space-y-4">
            <SkeletonBar className="h-3 w-20" />
            <SkeletonBar className="h-10 w-80" />
            <SkeletonBar className="h-5 w-48" />
            <div className="flex gap-2">
              <SkeletonBar className="h-6 w-16 rounded-full" />
              <SkeletonBar className="h-6 w-20 rounded-full" />
              <SkeletonBar className="h-6 w-14 rounded-full" />
            </div>
            <SkeletonBar className="h-16 w-full max-w-lg" />
            <div className="flex gap-8 pt-4">
              <Skeleton className="h-16 w-16" />
              <Skeleton className="h-16 w-16" />
              <Skeleton className="h-16 w-24" />
            </div>
          </div>
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="space-y-3">
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="h-4 w-64" />
        <Skeleton className="h-10 w-full rounded-[var(--radius-lg)]" />
      </div>

      {/* Stats skeleton */}
      <div className="space-y-3">
        <SkeletonBar className="h-3 w-28" />
        <div className="grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-48 rounded-[var(--radius-xl)]" />
        </div>
      </div>

      {/* Scenes skeleton */}
      <div className="space-y-4">
        <SkeletonBar className="h-3 w-20" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-[var(--radius-xl)]" />
        ))}
      </div>
    </div>
  );
}

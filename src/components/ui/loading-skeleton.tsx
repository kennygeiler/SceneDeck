import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("scene-skeleton rounded-[var(--radius-md)]", className)}
    />
  );
}

export function SkeletonBar({ className }: SkeletonProps) {
  return <Skeleton className={cn("h-3.5 rounded-full", className)} />;
}

export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={cn("size-10 rounded-full", className)} />;
}

export function ShotCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[var(--radius-xl)] border"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="relative aspect-video overflow-hidden border-b border-[var(--color-border-subtle)] p-4">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="relative flex items-start justify-between gap-3">
          <SkeletonBar className="h-7 w-28" />
          <SkeletonBar className="h-7 w-24" />
        </div>

        <div className="relative mt-24 flex items-end justify-between gap-4 sm:mt-28">
          <div className="flex-1 space-y-2">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-6 w-40 max-w-full" />
          </div>
          <SkeletonBar className="h-4 w-16" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBar className="h-4 w-32" />
          <SkeletonBar className="h-3 w-20" />
        </div>
        <SkeletonBar className="h-4 w-20" />
      </div>
    </div>
  );
}

export function ShotPlayerSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div
        className="relative aspect-video overflow-hidden rounded-[calc(var(--radius-xl)_+_6px)] border p-4 shadow-[var(--shadow-xl)]"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-secondary) 88%, transparent), color-mix(in oklch, var(--color-surface-primary) 92%, transparent))",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
        }}
      >
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="relative flex justify-end">
          <SkeletonBar className="h-9 w-32" />
        </div>
        <div className="relative mx-auto mt-16 max-w-xl space-y-4 text-center sm:mt-24 lg:mt-28">
          <SkeletonBar className="mx-auto h-3 w-28" />
          <SkeletonBar className="mx-auto h-8 w-56 max-w-full" />
          <SkeletonBar className="mx-auto h-4 w-full" />
          <SkeletonBar className="mx-auto h-4 w-5/6" />
        </div>
      </div>

      <div
        className="rounded-[var(--radius-xl)] border p-4"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 74%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBar className="h-3 w-24" />
          <SkeletonBar className="h-4 w-72 max-w-full" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-full border px-3 py-2"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-primary) 64%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <SkeletonCircle className="size-2.5" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/loading-skeleton";

export default function VisualizeLoading() {
  return (
    <div className="space-y-6 pb-16">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-96 rounded" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-[var(--radius-xl)] lg:col-span-2" />
        <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-64 rounded-[var(--radius-xl)] lg:col-span-2" />
        <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-72 rounded-[var(--radius-xl)]" />
      </div>
    </div>
  );
}

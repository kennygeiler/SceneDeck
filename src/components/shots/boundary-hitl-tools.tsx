"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Scissors, Merge } from "lucide-react";

import { Button } from "@/components/ui/button";

const MIN_SPLIT_MARGIN = 0.25;

type BoundaryHitlToolsProps = {
  shotId: string;
  startTc: number | null;
  endTc: number | null;
  nextShotId: string | null;
};

export function BoundaryHitlTools({
  shotId,
  startTc,
  endTc,
  nextShotId,
}: BoundaryHitlToolsProps) {
  const router = useRouter();
  const [splitAt, setSplitAt] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = startTc != null && endTc != null && endTc - startTc > MIN_SPLIT_MARGIN * 2;

  async function doSplit() {
    const t = Number(splitAt);
    if (!Number.isFinite(t)) {
      setMessage("Enter a valid split time in seconds.");
      return;
    }
    if (
      startTc == null ||
      endTc == null ||
      t <= startTc + MIN_SPLIT_MARGIN ||
      t >= endTc - MIN_SPLIT_MARGIN
    ) {
      setMessage(
        `Split must be between ${(startTc ?? 0) + MIN_SPLIT_MARGIN}s and ${(endTc ?? 0) - MIN_SPLIT_MARGIN}s.`,
      );
      return;
    }
    setSplitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/shots/${shotId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splitAtSec: t }),
      });
      const data = (await res.json()) as { error?: string; tailShotId?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Split failed.");
        return;
      }
      setMessage(`Split OK — tail shot ${data.tailShotId?.slice(0, 8)}…`);
      router.refresh();
    } catch {
      setMessage("Split request failed.");
    } finally {
      setSplitting(false);
    }
  }

  async function doMerge() {
    if (!nextShotId) {
      setMessage("No adjacent next shot found.");
      return;
    }
    setMerging(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/shots/${shotId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeWithShotId: nextShotId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Merge failed.");
        return;
      }
      setMessage("Merged with next shot.");
      router.refresh();
    } catch {
      setMessage("Merge request failed.");
    } finally {
      setMerging(false);
    }
  }

  if (!canEdit && !nextShotId) {
    return null;
  }

  return (
    <section
      className="rounded-[var(--radius-xl)] border p-6"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        Boundary HITL
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Split or merge without re-ingesting. Clears text embeddings, image embeddings, and detected
        objects on affected segments so you can re-run those jobs after boundaries settle.
      </p>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Split at (seconds, timeline)
            </label>
            <input
              type="number"
              step={0.01}
              placeholder={`${startTc?.toFixed?.(2) ?? "…"} – ${endTc?.toFixed?.(2) ?? "…"}`}
              value={splitAt}
              onChange={(e) => setSplitAt(e.target.value)}
              className="h-8 w-36 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={splitting}
            onClick={() => void doSplit()}
          >
            {splitting ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            Split
          </Button>
        </div>
      ) : null}

      {nextShotId ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={merging}
            onClick={() => void doMerge()}
          >
            {merging ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
            Merge with next shot
          </Button>
          <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Next: {nextShotId.slice(0, 8)}…
          </span>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 font-mono text-xs text-[var(--color-text-secondary)]">{message}</p>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ArchiveDemoSliceActionsProps = {
  spotlightShotId: string | null;
};

export function ArchiveDemoSliceActions({
  spotlightShotId,
}: ArchiveDemoSliceActionsProps) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link
        href="/browse"
        className={cn(
          buttonVariants({ size: "lg" }),
          "rounded-full px-6 text-sm shadow-[var(--shadow-glow)] sm:text-base",
        )}
      >
        Start at browse
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      {spotlightShotId ? (
        <Link
          href={`/shot/${spotlightShotId}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "rounded-full border-[var(--color-border-default)] px-6 text-sm text-[var(--color-text-primary)] backdrop-blur-xl sm:text-base",
          )}
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 52%, transparent)",
          }}
        >
          Open featured shot
        </Link>
      ) : null}
    </div>
  );
}

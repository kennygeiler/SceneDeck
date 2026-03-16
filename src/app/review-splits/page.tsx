import type { Metadata } from "next";

import { ReviewSplitsWorkspace } from "@/components/review/review-splits-workspace";

export const metadata: Metadata = {
  title: "Review Splits",
  description: "Local shot boundary review workspace for SceneDeck pipeline exports.",
};

type ReviewSplitsPageProps = {
  searchParams?: Promise<{
    splits?: string | string[];
  }>;
};

export default async function ReviewSplitsPage({
  searchParams,
}: ReviewSplitsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const splitsParam = resolvedSearchParams?.splits;

  return (
    <ReviewSplitsWorkspace
      initialSplitsUrl={typeof splitsParam === "string" ? splitsParam : null}
    />
  );
}

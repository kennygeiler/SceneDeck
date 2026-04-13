import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getShotById } from "@/db/queries";

type VerifyShotPageProps = {
  params: Promise<{
    shotId: string;
  }>;
};

export async function generateMetadata({
  params,
}: VerifyShotPageProps): Promise<Metadata> {
  const { shotId } = await params;
  const shot = await getShotById(shotId);

  if (!shot) {
    return { title: "Review" };
  }

  return {
    title: `Cut review · ${shot.film.title}`,
    description: "Per-shot composition QA was removed; redirecting to cut boundary review for this film.",
  };
}

/** Legacy `/verify/[shotId]` (composition ratings) — cut review is film-scoped on `/verify`. */
export default async function VerifyShotPage({ params }: VerifyShotPageProps) {
  const { shotId } = await params;
  const shot = await getShotById(shotId);

  if (!shot) {
    notFound();
  }

  redirect(`/verify?filmId=${shot.film.id}`);
}

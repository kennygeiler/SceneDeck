import { redirect } from "next/navigation";

/** Legacy `/verify/batch` (composition grid) — cut verification now uses the boundary triage grid. */
type Props = {
  searchParams?: Promise<{ filmId?: string }>;
};

export default async function VerifyBatchRedirectPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const filmId = typeof sp.filmId === "string" && sp.filmId.trim() !== "" ? sp.filmId.trim() : "";
  redirect(filmId ? `/verify?filmId=${encodeURIComponent(filmId)}` : "/verify");
}

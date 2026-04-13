import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<{ filmId?: string }>;
};

/** Legacy URL — cut triage lives on `/verify`. */
export default async function BoundaryTriageRedirectPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const filmId = typeof sp.filmId === "string" && sp.filmId.trim() !== "" ? sp.filmId.trim() : "";
  redirect(filmId ? `/verify?filmId=${encodeURIComponent(filmId)}` : "/verify");
}

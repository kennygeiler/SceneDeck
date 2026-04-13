import { getVerificationStats } from "@/db/queries";

const DEPRECATED_MSG =
  "Composition metadata verification (per-shot ratings and field corrections) is deprecated. Use /verify for cut boundary triage only.";

export async function GET() {
  try {
    const stats = await getVerificationStats();

    return Response.json(stats);
  } catch (error) {
    console.error("Failed to load verification stats.", error);

    return Response.json(
      { error: "Failed to load verification stats." },
      { status: 500 },
    );
  }
}

export async function POST() {
  return Response.json(
    { error: DEPRECATED_MSG, code: "composition_verification_deprecated" },
    { status: 410 },
  );
}

import { getAccuracyStats } from "@/db/queries";

export async function GET() {
  try {
    const stats = await getAccuracyStats();

    return Response.json(stats);
  } catch (error) {
    console.error("Failed to compute accuracy stats.", error);

    return Response.json(
      { error: "Failed to compute accuracy stats." },
      { status: 500 },
    );
  }
}

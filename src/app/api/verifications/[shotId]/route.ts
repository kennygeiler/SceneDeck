import { NextRequest } from "next/server";

import { getVerificationsForShot } from "@/db/queries";

type RouteContext = {
  params: Promise<{
    shotId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { shotId } = await params;

    if (!shotId) {
      return Response.json({ error: "shotId is required." }, { status: 400 });
    }

    const verifications = await getVerificationsForShot(shotId);

    return Response.json(verifications);
  } catch (error) {
    console.error("Failed to load shot verifications.", error);

    return Response.json(
      { error: "Failed to load shot verifications." },
      { status: 500 },
    );
  }
}

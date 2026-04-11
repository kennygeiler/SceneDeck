export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getBoundaryEvalRunById } from "@/db/boundary-tuning-queries";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const run = await getBoundaryEvalRunById(id);
  if (!run) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ run });
}

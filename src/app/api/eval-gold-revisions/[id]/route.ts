export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getEvalGoldRevisionById } from "@/db/boundary-tuning-queries";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const revision = await getEvalGoldRevisionById(id);
  if (!revision) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ revision });
}

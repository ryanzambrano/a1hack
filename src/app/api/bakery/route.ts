import { serverState } from "@/lib/server/state";
import type { Bakery } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The client syncs the bakery profile here so the voice agent knows who it represents. */
export async function POST(req: Request) {
  serverState.bakery = (await req.json()) as Bakery;
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ bakery: serverState.bakery });
}

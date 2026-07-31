import { getBakery, saveBakery } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import type { Bakery } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The client syncs the bakery profile here so the voice agent knows who it represents. */
export async function POST(req: Request) {
  return handle(async () => {
    await saveBakery((await req.json()) as Bakery);
    return { ok: true };
  });
}

export async function GET() {
  return handle(async () => ({ bakery: await getBakery() }));
}

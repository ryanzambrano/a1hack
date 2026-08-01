import type { NextRequest } from "next/server";

import { listOrders } from "@/lib/server/bakery/catalog";
import { ORDER_STATUSES } from "@/lib/server/bakery/pricing";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The order board, sorted by pickup date — the order the bakery produces in. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    return { orders: await listOrders({ status }), statuses: ORDER_STATUSES };
  });
}

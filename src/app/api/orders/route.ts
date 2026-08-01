import { createOrder } from "@/lib/server/bakery/catalog";
import { getPaymentProvider } from "@/lib/server/bakery/payments";
import type { OrderInput } from "@/lib/server/bakery/types";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Places an order from a cart payload. The server recomputes every price, so
 * the body carries references and quantities only, never money.
 */
export async function POST(req: Request) {
  return handle(
    async () => {
      const body = (await req.json()) as OrderInput;
      return { order: await createOrder(body, getPaymentProvider()) };
    },
    { status: 201 }
  );
}

import { getOrder } from "@/lib/server/bakery/catalog";
import { DomainError } from "@/lib/server/bakery/pricing";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Backs the confirmation view.
 *
 * NOTE (carried over from bakery-platform, unchanged by this port): order ids
 * are sequential and this route is unauthenticated, so anyone who can guess an
 * id can read that order's name, phone, email and pickup time. The demo needs
 * a receipt link that works straight after checkout; a real deployment should
 * key this on the order_number plus an emailed token, or put it behind a
 * session. Flagged rather than silently changed, because fixing it properly
 * means deciding how customers authenticate.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const order = await getOrder(Number(id));
    if (!order) throw new DomainError(404, "That order does not exist");
    return { order };
  });
}

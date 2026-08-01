import { setOrderStatus } from "@/lib/server/bakery/catalog";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Steps an order along the board. Legal moves are
 * new -> confirmed -> ready -> picked_up, plus cancel from any non-terminal
 * state; anything else comes back 400 and the UI disables that button.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/orders/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { status } = (await req.json()) as { status?: string };
    return { order: await setOrderStatus(Number(id), String(status ?? "")) };
  });
}

import { getProduct } from "@/lib/server/bakery/catalog";
import { DomainError } from "@/lib/server/bakery/pricing";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/products/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const product = await getProduct(Number(id));
    if (!product) throw new DomainError(404, "That product does not exist");
    return { product };
  });
}

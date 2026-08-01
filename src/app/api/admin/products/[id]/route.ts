import { updateProduct } from "@/lib/server/bakery/catalog";
import type { ProductInput } from "@/lib/server/bakery/catalog";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Partial update. `options`, when present, replaces the product's whole option
 * list. Deactivating is `{ "active": false }` — there is no delete, so order
 * history keeps pointing at something real.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/products/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = (await req.json()) as ProductInput;
    return { product: await updateProduct(Number(id), body) };
  });
}

import { listProducts } from "@/lib/server/bakery/catalog";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Active products, sorted. The storefront resolves cart lines against this. */
export async function GET() {
  return handle(async () => ({ products: await listProducts() }));
}

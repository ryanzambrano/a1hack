import { createProduct, listProducts } from "@/lib/server/bakery/catalog";
import type { ProductInput } from "@/lib/server/bakery/catalog";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Includes deactivated products: the admin needs to see what it hid. */
export async function GET() {
  return handle(async () => ({
    products: await listProducts({ includeInactive: true }),
  }));
}

export async function POST(req: Request) {
  return handle(
    async () => ({ product: await createProduct((await req.json()) as ProductInput) }),
    { status: 201 }
  );
}

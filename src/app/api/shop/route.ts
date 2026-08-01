import { getShopBakery } from "@/lib/server/bakery/catalog";
import { pickupSlots } from "@/lib/server/bakery/pricing";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Storefront header data: who the bakery is and when you can collect. */
export async function GET() {
  return handle(async () => {
    const bakery = await getShopBakery();
    return { bakery, pickupSlots: pickupSlots(bakery) };
  });
}

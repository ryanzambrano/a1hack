import type { NextRequest } from "next/server";

import { getProduct, getShopBakery } from "@/lib/server/bakery/catalog";
import { DomainError, earliestPickupDate, pickupSlots } from "@/lib/server/bakery/pricing";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Pickup constraints for the products in the cart: the earliest date under the
 * strictest lead time, the closed weekdays, and the slot list. The checkout
 * page uses these to bound its date input rather than guessing.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const bakery = await getShopBakery();
    const raw = (req.nextUrl.searchParams.get("products") ?? "").trim();
    const ids = raw ? raw.split(",").map(Number) : [];

    let maxLeadTimeDays = 0;
    for (const id of ids) {
      const product = await getProduct(id);
      if (!product) throw new DomainError(400, "Unknown product in the cart");
      maxLeadTimeDays = Math.max(maxLeadTimeDays, product.leadTimeDays);
    }

    return {
      earliestDate: earliestPickupDate(bakery, maxLeadTimeDays),
      maxLeadTimeDays,
      closedWeekdays: bakery.closedWeekdays,
      slots: pickupSlots(bakery),
    };
  });
}

import { seedShop } from "@/lib/server/bakery/seed";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Loads the demo catalog. Idempotent: it only fills in what is missing, so it
 * never overwrites a catalog the bakery has edited. The shop page offers this
 * when it finds no products (including after "Reset demo", which clears the
 * bakery row and cascades the catalog with it).
 */
export async function POST() {
  return handle(() => seedShop());
}

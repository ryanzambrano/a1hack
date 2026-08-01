import { invalidateShop } from "@/lib/server/catalog";
import { getBakery, saveBakery } from "@/lib/server/db";
import { geocode, isPlaced } from "@/lib/server/geo";
import { handle } from "@/lib/server/http";
import type { Bakery } from "@/lib/types";

export const dynamic = "force-dynamic";

/** What we ask the map for: the street address, qualified by the city. */
function addressQuery(b: Bakery): string {
  return [b.address.trim(), b.location.trim()].filter(Boolean).join(", ");
}

/**
 * Put the shop on the map.
 *
 * Coordinates are owned by the server, never by the form — the client has no
 * business sending them, and a stale pair posted alongside a freshly typed
 * address would quote every delivery from the old shop. They are only looked
 * up when the address text actually changed, so saving the rest of the
 * questionnaire costs no round trip to a geocoder.
 */
async function place(incoming: Bakery, current: Bakery | null): Promise<Bakery> {
  const query = addressQuery(incoming);
  if (!query) return { ...incoming, latitude: 0, longitude: 0 };

  const unchanged = current && addressQuery(current) === query;
  if (unchanged && isPlaced(current)) {
    return { ...incoming, latitude: current.latitude, longitude: current.longitude };
  }

  const found = await geocode(query);
  return {
    ...incoming,
    latitude: found?.lat ?? 0,
    longitude: found?.lon ?? 0,
  };
}

/** The client syncs the bakery profile here so the voice agent knows who it represents. */
export async function POST(req: Request) {
  return handle(async () => {
    const incoming = (await req.json()) as Bakery;
    const placed = await place(incoming, await getBakery());
    await saveBakery(placed);
    // The agent caches the shop for a minute; an edited profile has to reach
    // the next call, not the one after it.
    invalidateShop();
    return { ok: true, placed: isPlaced(placed) };
  });
}

export async function GET() {
  return handle(async () => ({ bakery: await getBakery() }));
}

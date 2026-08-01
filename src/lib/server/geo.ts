/**
 * Putting an address on the map.
 *
 * The bakery draws a delivery zone in miles, so quoting a delivery on a call
 * means turning two pieces of free text — the shop's address and whatever the
 * caller just read out — into coordinates.
 *
 * Two rules drive the shape of this module:
 *
 *  1. A live call cannot wait. Every lookup has a hard timeout and a cache,
 *     and a miss returns null rather than throwing, so the agent can say "let
 *     me take that down" instead of the caller hearing silence.
 *  2. It must work with no key configured. MAPBOX_TOKEN is used when present;
 *     otherwise it falls back to OpenStreetMap's Nominatim, which is free and
 *     keyless (and rate-limited to roughly one call a second, which is far
 *     more than a phone line generates).
 */

export interface Point {
  lat: number;
  lon: number;
}

export interface GeocodeResult extends Point {
  /** The provider's own rendering of what it found, for the order note. */
  label: string;
}

/** A live call cannot spend longer than this waiting on a map lookup. */
const TIMEOUT_MS = 3_500;
const CACHE_MS = 24 * 60 * 60_000;
const CACHE_LIMIT = 500;

const cache = new Map<string, { at: number; value: GeocodeResult | null }>();

function cacheKey(query: string, near: Point | null): string {
  return near ? `${query}@${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : query;
}

function remember(key: string, value: GeocodeResult | null): GeocodeResult | null {
  // Oldest-first eviction; insertion order is Map's iteration order.
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function geocoderConfigured(): boolean {
  return true; // Nominatim needs no key, so there is always a provider.
}

interface MapboxResponse {
  features?: Array<{ center?: [number, number]; place_name?: string }>;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
}

/**
 * Resolve an address to coordinates. `near` biases the search, which is what
 * turns "twelve Oak Street" — said on the phone, with no city — into the Oak
 * Street four miles from the bakery rather than one in another state.
 */
export async function geocode(
  query: string,
  near: Point | null = null
): Promise<GeocodeResult | null> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) return null;

  const key = cacheKey(q, near);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  try {
    const token = process.env.MAPBOX_TOKEN;
    const found = token ? await viaMapbox(q, near, token) : await viaNominatim(q, near);
    return remember(key, found);
  } catch (err) {
    // A failed lookup is a normal outcome on a call, not an error to throw at
    // the caller: the agent falls back to taking the address down by hand.
    console.warn("geocode failed", q, err);
    return remember(key, null);
  }
}

async function viaMapbox(
  q: string,
  near: Point | null,
  token: string
): Promise<GeocodeResult | null> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  if (near) url.searchParams.set("proximity", `${near.lon},${near.lat}`);

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`mapbox ${res.status}`);

  const body = (await res.json()) as MapboxResponse;
  const feature = body.features?.[0];
  if (!feature?.center) return null;
  const [lon, lat] = feature.center;
  return { lat, lon, label: feature.place_name ?? q };
}

async function viaNominatim(q: string, near: Point | null): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (near) {
    // A generous box around the bakery, unbounded so a genuinely distant
    // address still resolves — and is then correctly refused as out of zone.
    const d = 1.5;
    url.searchParams.set(
      "viewbox",
      `${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`
    );
  }

  const res = await fetch(url, {
    // Nominatim's usage policy requires an identifying User-Agent.
    headers: { "User-Agent": "sweetleads-bakery-agent/1.0 (bakery delivery quoting)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);

  const [first] = (await res.json()) as NominatimResult[];
  if (!first?.lat || !first?.lon) return null;
  return { lat: Number(first.lat), lon: Number(first.lon), label: first.display_name ?? q };
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles — the straight line a map circle draws. */
export function milesBetween(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when a profile actually carries coordinates we can measure from. */
export function isPlaced(point: { latitude: number; longitude: number }): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    (point.latitude !== 0 || point.longitude !== 0);
}

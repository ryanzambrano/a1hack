/**
 * A stand-in image for a seeded archive cake.
 *
 * The archive is designed around real photographs — Even Dough has roughly
 * 2,000 of them. Until those are imported, seeded designs need something to
 * show on the proposal page. These are deliberately drawn as flat
 * illustrations rather than anything photographic: a generated image that
 * looked like a real cake would be a photo of work the bakery never did, and
 * the proposal page labels them as samples for the same reason.
 *
 * Rows with a real `photo_url` never reach this route.
 */

import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SWATCHES: Record<string, string> = {
  rainbow: "#f0abfc",
  pink: "#f9a8d4",
  blush: "#fbcfe8",
  yellow: "#fde047",
  blue: "#93c5fd",
  navy: "#1e3a8a",
  green: "#86efac",
  brown: "#b45309",
  beige: "#e7d3b3",
  cream: "#fdf6e3",
  white: "#ffffff",
  ivory: "#fffbeb",
  gold: "#eab308",
  pastel: "#ddd6fe",
  chocolate: "#78350f",
  red: "#f87171",
  berry: "#be185d",
};

function paletteFor(colors: string[]): string[] {
  const hits = colors.map((c) => SWATCHES[c]).filter(Boolean);
  return hits.length ? hits : ["#f5d0c5", "#e8b4a0"];
}

function render(tiers: number, colors: string[], technique: string): string {
  const palette = paletteFor(colors);
  const width = 400;
  const height = 300;
  const layers: string[] = [];

  const count = Math.max(1, Math.min(4, tiers));
  const baseWidth = 240;
  const tierHeight = Math.min(46, 150 / count);

  for (let i = 0; i < count; i++) {
    const w = baseWidth - i * (baseWidth / (count + 1.6));
    const x = (width - w) / 2;
    const y = 240 - (i + 1) * tierHeight;
    const fill = palette[i % palette.length];
    layers.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${tierHeight.toFixed(
        1
      )}" rx="6" fill="${fill}" stroke="rgba(0,0,0,.10)"/>`
    );
    // A drip finish reads as scallops along the top edge of each tier.
    if (technique === "drip") {
      const drips = Math.round(w / 26);
      for (let d = 0; d < drips; d++) {
        const dx = x + 10 + d * (w - 20) / Math.max(1, drips - 1);
        layers.push(
          `<circle cx="${dx.toFixed(1)}" cy="${(y + 6).toFixed(1)}" r="5" fill="rgba(0,0,0,.16)"/>`
        );
      }
    }
  }

  const topY = 240 - count * tierHeight;
  const accent = palette[palette.length - 1];
  const topper =
    technique === "sculpted"
      ? `<circle cx="200" cy="${(topY - 18).toFixed(1)}" r="17" fill="${accent}" stroke="rgba(0,0,0,.12)"/>`
      : technique === "fresh flowers"
        ? `<g fill="${accent}"><circle cx="186" cy="${(topY - 9).toFixed(1)}" r="7"/><circle cx="200" cy="${(topY - 14).toFixed(1)}" r="8"/><circle cx="214" cy="${(topY - 9).toFixed(1)}" r="7"/></g>`
        : `<rect x="196" y="${(topY - 22).toFixed(1)}" width="8" height="22" rx="4" fill="${accent}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
  <rect width="${width}" height="${height}" fill="#faf7f4"/>
  <ellipse cx="200" cy="248" rx="140" ry="12" fill="rgba(0,0,0,.06)"/>
  ${layers.join("\n  ")}
  ${topper}
  <rect x="120" y="246" width="160" height="7" rx="3.5" fill="#e7e0d8"/>
</svg>`;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/archive/photo/[id]">) {
  const { id } = await ctx.params;

  const { data, error } = await adminClient()
    .from("archive_cakes")
    .select("tiers, colors, techniques, photo_url")
    .eq("id", Number(id))
    .maybeSingle();

  if (error || !data) return new Response("Not found", { status: 404 });
  if (data.photo_url) return Response.redirect(data.photo_url, 302);

  const decoration =
    data.techniques.find((t) => !["fondant", "buttercream", "whipped cream"].includes(t)) ?? "";

  return new Response(render(data.tiers, data.colors, decoration), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

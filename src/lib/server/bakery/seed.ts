// Seeds the storefront: the bakery's shop fields and the demo catalog.
// Ported from bakery-platform/lib/seed.js + reset-db.js, but idempotent rather
// than destructive, because it runs against the same live row the lead-gen
// side owns.

import { adminClient } from "@/lib/supabase/admin";

import { seedBakery, seedProducts } from "./seed-data";

export interface SeedResult {
  bakeryCreated: boolean;
  productsInserted: number;
}

/**
 * Fills in whatever is missing:
 *  - no bakery row at all -> create it from the demo profile
 *  - a row that predates this port -> leave its lead-gen fields alone and set
 *    only the shop fields, so a bakery configured in Setup keeps its identity
 *  - an empty catalog -> insert the ten demo products with their options
 *
 * Running it twice is a no-op.
 */
export async function seedShop(): Promise<SeedResult> {
  const supabase = adminClient();

  const { data: existing, error: readError } = await supabase
    .from("bakeries")
    .select("id, slug, address, email")
    .eq("id", "default")
    .maybeSingle();
  if (readError) throw new Error(`seedShop: ${readError.message}`);

  let bakeryCreated = false;

  if (!existing) {
    // A fresh database: create the row with both halves populated, so the
    // storefront and the lead-gen side describe the same business.
    const { error } = await supabase.from("bakeries").insert({
      id: "default",
      // lead-gen half (mirrors the defaults in src/app/setup/page.tsx)
      name: seedBakery.name,
      location: "Austin, TX",
      cake_types: ["Birthday", "Custom / themed", "Cupcakes"],
      price_min: 45,
      price_max: 350,
      fulfillment: ["pickup", "delivery"],
      phone: seedBakery.phone,
      hours: "Tue-Sun, 8 AM - 6 PM",
      monthly_budget: 300,
      // storefront half
      slug: seedBakery.slug,
      description: seedBakery.description,
      address: seedBakery.address,
      email: seedBakery.email,
      currency: seedBakery.currency,
      order_cutoff_hour: seedBakery.orderCutoffHour,
      open_hour: seedBakery.openHour,
      close_hour: seedBakery.closeHour,
      closed_weekdays: seedBakery.closedWeekdays,
    });
    if (error) throw new Error(`seedShop: ${error.message}`);
    bakeryCreated = true;
  } else if (!existing.address || !existing.email) {
    // Set up through /setup before this port existed: give it the shop fields
    // it never had, without touching the name, phone or hours it already has.
    const { error } = await supabase
      .from("bakeries")
      .update({
        slug: existing.slug || seedBakery.slug,
        address: existing.address || seedBakery.address,
        email: existing.email || seedBakery.email,
      })
      .eq("id", "default");
    if (error) throw new Error(`seedShop: ${error.message}`);
  }

  // Catalog: only seed an empty one, so an edited catalog is never overwritten.
  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("bakery_id", "default");
  if (countError) throw new Error(`seedShop: ${countError.message}`);
  if ((count ?? 0) > 0) return { bakeryCreated, productsInserted: 0 };

  const { data: inserted, error: productError } = await supabase
    .from("products")
    .insert(
      seedProducts.map((p, i) => ({
        bakery_id: "default",
        name: p.name,
        description: p.description,
        category: p.category,
        image_url: p.imageUrl,
        base_price_cents: p.basePriceCents,
        lead_time_days: p.leadTimeDays,
        can_have_cake_text: p.canHaveCakeText,
        cake_text_price_cents: p.cakeTextPriceCents,
        active: true,
        sort_order: i + 1,
      }))
    )
    .select("id, name");
  if (productError) throw new Error(`seedShop: ${productError.message}`);

  // Options reference their product by generated id, so they go in afterwards.
  const idByName = new Map((inserted ?? []).map((r) => [r.name, r.id]));
  const optionRows = seedProducts.flatMap((p) => {
    const productId = idByName.get(p.name);
    if (productId === undefined) return [];
    return p.options.map((o, i) => ({
      product_id: productId,
      group_name: o.groupName,
      value_name: o.valueName,
      price_delta_cents: o.priceDeltaCents,
      is_default: Boolean(o.isDefault),
      position: i,
    }));
  });

  if (optionRows.length > 0) {
    const { error } = await supabase.from("product_options").insert(optionRows);
    if (error) throw new Error(`seedShop: ${error.message}`);
  }

  return { bakeryCreated, productsInserted: inserted?.length ?? 0 };
}

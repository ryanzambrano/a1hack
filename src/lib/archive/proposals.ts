/**
 * A proposal: the numbered set of past cakes shown to one caller.
 *
 * This is how the archive works on a phone call. You cannot show a photo down
 * a phone line, but the caller is holding the screen you need — so the agent
 * texts a link mid-conversation and keeps talking. The options are numbered
 * so the answer comes back as speech ("number three"), which needs no
 * callback, no app, and no waiting for them to reply to an email.
 *
 * That is the whole compression. Even Dough measured the same effect in her
 * inbox: a thread with a real past cake in it runs "two emails, three emails
 * and you're done" instead of seven to twelve. Doing it inside a single call
 * removes even those.
 *
 * Every option also carries a spoken description, because a caller who is
 * driving cannot open the link and the call still has to work.
 */

import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { CompsEstimate } from "./comps";
import { type ArchiveCake, type DesignBrief, type ScoredDesign, describeDesign } from "./retrieval";

/** No 0/O or 1/I/L — these get read aloud and written down. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function makeCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

export interface ProposalOptionInput {
  design: ScoredDesign;
  priceLowCents: number;
  priceHighCents: number;
  aboveBudget: boolean;
}

export interface CreatedProposal {
  id: number;
  code: string;
  url: string;
  options: Array<{
    position: number;
    cake: ArchiveCake;
    priceLowCents: number;
    priceHighCents: number;
    aboveBudget: boolean;
    rationale: string;
  }>;
}

export async function createProposal(input: {
  bakeryId: string;
  leadId: string | null;
  brief: DesignBrief;
  options: ProposalOptionInput[];
}): Promise<CreatedProposal> {
  const sb = adminClient();

  // Codes are short enough to collide occasionally; the unique index is the
  // real guarantee, so retry rather than trusting randomness.
  let code = "";
  let proposalId: number | null = null;
  for (let attempt = 0; attempt < 5 && proposalId === null; attempt++) {
    code = makeCode();
    const { data, error } = await sb
      .from("proposals")
      .insert({
        code,
        bakery_id: input.bakeryId,
        lead_id: input.leadId,
        brief: input.brief as unknown as Json,
      })
      .select("id")
      .single();
    if (!error && data) proposalId = data.id;
    else if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(`createProposal: ${error.message}`);
    }
  }
  if (proposalId === null) throw new Error("createProposal: could not allocate a code");

  const rows = input.options.map((o, i) => ({
    proposal_id: proposalId,
    position: i + 1,
    archive_cake_id: o.design.cake.id,
    price_low_cents: o.priceLowCents,
    price_high_cents: o.priceHighCents,
    rationale: o.design.reasons.join(", "),
    above_budget: o.aboveBudget,
  }));

  const { error: optionError } = await sb.from("proposal_options").insert(rows);
  if (optionError) throw new Error(`createProposal options: ${optionError.message}`);

  return {
    id: proposalId,
    code,
    url: `${appBaseUrl()}/p/${code}`,
    options: input.options.map((o, i) => ({
      position: i + 1,
      cake: o.design.cake,
      priceLowCents: o.priceLowCents,
      priceHighCents: o.priceHighCents,
      aboveBudget: o.aboveBudget,
      rationale: o.design.reasons.join(", "),
    })),
  };
}

export interface ProposalView {
  code: string;
  bakeryName: string;
  brief: DesignBrief;
  chosenPosition: number | null;
  options: Array<{
    position: number;
    title: string;
    description: string;
    photoUrl: string;
    themes: string[];
    colors: string[];
    techniques: string[];
    servings: number | null;
    tiers: number;
    priceLowCents: number;
    priceHighCents: number;
    aboveBudget: boolean;
    /** Seeded demo designs are labelled rather than passed off as real work. */
    isSample: boolean;
    /** A previous customer's name is piped on the cake in this photo. */
    hasNameText: boolean;
  }>;
}

export async function getProposal(code: string): Promise<ProposalView | null> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("proposals")
    .select(
      "code, brief, chosen_position, bakeries(name), proposal_options(position, price_low_cents, price_high_cents, above_budget, archive_cakes(*))"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(`getProposal: ${error.message}`);
  if (!data) return null;

  const brief = data.brief as unknown as DesignBrief | null;
  // The page must agree with what the agent said on the call: describe and
  // size every design against the party, not against when it was first made.
  const targetServings = brief?.guests ?? null;

  const options = (data.proposal_options ?? [])
    .map((o) => {
      const cake = o.archive_cakes as ArchiveCake | null;
      if (!cake) return null;
      return {
        position: o.position,
        title: cake.title,
        description: describeDesign(cake, targetServings ?? cake.servings),
        photoUrl: cake.photo_url || `/api/archive/photo/${cake.id}`,
        themes: cake.themes,
        colors: cake.colors,
        techniques: cake.techniques,
        servings: targetServings ?? cake.servings,
        tiers: cake.tiers,
        priceLowCents: o.price_low_cents,
        priceHighCents: o.price_high_cents,
        aboveBudget: o.above_budget,
        isSample: cake.source === "seed",
        // Most of these photos carry a previous customer's child's name. The
        // page says so rather than letting a caller wonder why the cake is
        // addressed to someone else.
        hasNameText: cake.has_name_text,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => a.position - b.position);

  return {
    code: data.code,
    bakeryName: (data.bakeries as { name: string } | null)?.name ?? "the bakery",
    brief: brief as DesignBrief,
    chosenPosition: data.chosen_position,
    options,
  };
}

export async function markOpened(code: string): Promise<void> {
  await adminClient()
    .from("proposals")
    .update({ opened_at: new Date().toISOString() })
    .eq("code", code.toUpperCase())
    .is("opened_at", null);
}

export async function recordChoice(
  code: string,
  position: number,
  estimate: CompsEstimate | null
): Promise<void> {
  const { error } = await adminClient()
    .from("proposals")
    .update({
      chosen_position: position,
      estimate: estimate as unknown as Json,
    })
    .eq("code", code.toUpperCase());
  if (error) throw new Error(`recordChoice: ${error.message}`);
}

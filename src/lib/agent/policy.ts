/**
 * The rules that do not get a vote.
 *
 * Everything here runs as plain code around the model, not as a request
 * inside the prompt. A prompt is a strong suggestion; a small bakery being
 * sued over an allergy answer, or a caller stuck in an infinite loop burning
 * tokens, needs something stronger than a suggestion.
 */

import type { CallState } from "./ontology";
import { speakMoney } from "./speech";

/** A call that runs longer than this has stopped being a cake order. */
export const MAX_TURNS = 40;
export const MAX_CALL_MS = 8 * 60_000;
/** Consecutive turns with no usable speech before we offer a human. */
export const MAX_MISSES = 3;

export interface Stop {
  say: string;
  /** Hand to a human rather than just hanging up. */
  handoff: boolean;
}

/**
 * Anything touching allergies or ingredient safety. This is checked against
 * the caller's own words BEFORE the model is consulted, so no prompt wording
 * and no injected instruction can talk the agent into answering it. "Made in
 * a facility that also handles nuts" is a question with a legal answer and a
 * medical consequence, and neither belongs to a language model.
 */
const SAFETY_PATTERNS = [
  /\ballerg(y|ies|ic|en|ens)\b/i,
  /\banaphyla/i,
  /\bcoeliac\b|\bceliac\b/i,
  /\bintoleran(t|ce)\b/i,
  /\b(nut|peanut|dairy|gluten|egg|soy|sesame|lactose)[\s-]*(free|allergy)\b/i,
  /\bcross[\s-]?contamina/i,
  /\bis it safe\b/i,
];

const HUMAN_PATTERNS = [
  /\b(speak|talk|spoke)\s+(to|with)\s+(a|an|the)?\s*(real\s+)?(person|human|someone|manager|owner|baker)\b/i,
  /\breal person\b/i,
  /\bnot a (robot|bot|machine|computer)\b/i,
  /\bcustomer service\b/i,
];

const COMPLAINT_PATTERNS = [
  /\b(wrong|ruined|late|missing|refund|complain|complaint|terrible|awful)\b.*\border\b/i,
  /\border\b.*\b(wrong|ruined|late|missing|refund|never (came|arrived))\b/i,
];

/** Weddings and big catering are quoted by a person, not on a first call. */
const BIG_JOB_PATTERNS = [/\bwedding\b/i, /\bcater(ing)?\b/i, /\bcorporate event\b/i];

export interface MandatoryEscalation {
  reason: string;
  say: string;
}

/**
 * Deterministic escalation triggers. Returns the exact words to say — the
 * model is not asked to paraphrase these, because the safe answer to an
 * allergy question is a fixed sentence.
 */
export function mandatoryEscalation(utterance: string): MandatoryEscalation | null {
  const text = utterance ?? "";

  if (SAFETY_PATTERNS.some((p) => p.test(text))) {
    return {
      reason: "allergy or ingredient safety question",
      say: "That's an important one and I don't want to get it wrong, so I'll have someone from the bakery call you back to answer it properly. Everything is baked in a shared kitchen, so please do check with them before you order.",
    };
  }
  if (HUMAN_PATTERNS.some((p) => p.test(text))) {
    return {
      reason: "caller asked for a human",
      say: "Of course. I'll have someone from the bakery call you back shortly.",
    };
  }
  if (COMPLAINT_PATTERNS.some((p) => p.test(text))) {
    return {
      reason: "complaint about an existing order",
      say: "I'm sorry about that. That needs a person rather than me, so I'll get someone from the bakery to call you back right away.",
    };
  }
  if (BIG_JOB_PATTERNS.some((p) => p.test(text))) {
    return {
      reason: "wedding or catering enquiry",
      say: "Lovely. That one is quoted by our head baker rather than over the phone with me, so I'll take your details and have them call you back.",
    };
  }
  return null;
}

/** Hard stops. Checked every turn, before anything else costs money. */
export function guard(state: CallState, now = Date.now()): Stop | null {
  if (state.turns >= MAX_TURNS) {
    return {
      say: "I want to make sure we get this right, so let me have someone from the bakery call you back to finish it off.",
      handoff: true,
    };
  }
  if (now - state.startedAt > MAX_CALL_MS) {
    return {
      say: "We've been on a while, so let me get someone from the bakery to call you back and wrap this up.",
      handoff: true,
    };
  }
  if (state.misses >= MAX_MISSES) {
    return {
      say: "The line isn't coming through clearly on my end. Let me get someone from the bakery to call you straight back.",
      handoff: true,
    };
  }
  return null;
}

/* ---------------------------- the price invariant ---------------------------- */

const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;

/**
 * Prices the agent is currently allowed to say: whatever a tool last
 * computed, and whatever was actually booked. Anything else is invented.
 */
export function allowedPrices(state: CallState): string[] {
  const allowed: string[] = [];
  if (state.quotedCents !== null) allowed.push(speakMoney(state.quotedCents));
  if (state.booked) allowed.push(speakMoney(state.booked.totalCents));
  // Bands read off design options are tool-computed from real past sales, so
  // both endpoints are sayable.
  for (const cents of state.offeredCents ?? []) allowed.push(speakMoney(cents));
  if (state.chosenDesign) {
    allowed.push(speakMoney(state.chosenDesign.lowCents));
    allowed.push(speakMoney(state.chosenDesign.highCents));
  }
  return allowed;
}

/** Every money figure in `say` that no tool produced. Empty means clean. */
export function unbackedPrices(say: string, state: CallState): string[] {
  const allowed = new Set(allowedPrices(state).map((p) => p.replace(/\s/g, "")));
  return (say.match(MONEY) ?? [])
    .map((m) => m.replace(/\s/g, ""))
    .filter((m) => !allowed.has(m));
}

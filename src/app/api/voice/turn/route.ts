import { after } from "next/server";
import { runTurn } from "@/lib/agent/brain";
import { rememberTurn } from "@/lib/agent/ontology";
import { loadCallContext, saveCallState } from "@/lib/agent/session";
import { speakMoney } from "@/lib/agent/speech";
import { speakDate } from "@/lib/agent/dates";
import { gatherSpeech, sayAndHangup, sendSms, texml } from "@/lib/server/a1";
import { loadShop } from "@/lib/server/catalog";
import { appendTranscript, markSessionDone, updateLead } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One speech turn of a live call.
 *
 * The caller's clock runs from the moment they stop talking, so the hot path
 * is: one database read (session plus its lead, embedded), a cached catalog,
 * the model, then the reply. Bookkeeping the call itself does not depend on
 * happens after the response is already on its way.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const speech = String(form.get("SpeechResult") ?? "").trim();

  try {
    const [context, shop] = await Promise.all([loadCallContext(callSid), loadShop()]);

    if (!context || context.done) {
      return texml(sayAndHangup("Thanks for calling. Goodbye!"));
    }

    const { state } = context;

    // A retried webhook replays the previous answer rather than paying for
    // the model again and appending the transcript twice.
    const key = `${state.turns}:${speech}`;
    if (state.lastKey === key && state.lastReply) {
      const { say, done } = state.lastReply;
      return texml(done ? sayAndHangup(say) : gatherSpeech(say, "/api/voice/turn"));
    }

    const turn = await runTurn({
      utterance: speech,
      history: state.history,
      ctx: { leadId: context.leadId, phone: context.phone, state },
      shop,
    });

    if (speech) rememberTurn(state, speech, turn.say);
    else state.history.push({ role: "assistant", content: turn.say });
    state.lastKey = key;
    state.lastReply = { say: turn.say, done: turn.done };

    // The next turn reads this, so it cannot be deferred.
    await saveCallState(context.leadId, state);

    after(async () => {
      const lines = [
        ...(speech ? [{ speaker: "customer" as const, text: speech }] : []),
        { speaker: "agent" as const, text: turn.say },
      ];
      await appendTranscript(context.leadId, lines);

      if (turn.done) await markSessionDone(callSid);

      const booked = state.booked;
      if (booked) {
        await updateLead(context.leadId, {
          ...(state.draft.customerName ? { name: state.draft.customerName } : {}),
          status: "qualified",
          callOutcome: `Ordered on the phone — ${booked.orderNumber}, ${speakMoney(
            booked.totalCents
          )}, pickup ${speakDate(booked.pickupDate)}.`,
          nextAction: `Bake for pickup ${speakDate(booked.pickupDate)} at ${booked.pickupSlot}`,
        });
        // Only lands for OTP-verified numbers, so it is best-effort by design.
        void sendSms(
          context.phone,
          `${shop.name}: order ${booked.orderNumber} confirmed — ${speakMoney(
            booked.totalCents
          )}, pickup ${speakDate(booked.pickupDate)} at ${booked.pickupSlot}. Pay when you collect.`
        );
      } else if (turn.handoff) {
        await updateLead(context.leadId, {
          ...(state.draft.customerName ? { name: state.draft.customerName } : {}),
          status: "follow_up",
          callOutcome: `Handed to a human — ${state.escalation?.reason ?? "needs a callback"}.`,
          nextAction: "Call this customer back",
        });
      } else if (turn.done) {
        await updateLead(context.leadId, { status: "closed" });
      }
    });

    return texml(
      turn.done ? sayAndHangup(turn.say) : gatherSpeech(turn.say, "/api/voice/turn")
    );
  } catch (err) {
    console.error("voice turn failed", err);
    return texml(
      sayAndHangup("Sorry, something went wrong on our end. Please call back in a moment.")
    );
  }
}

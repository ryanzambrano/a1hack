import { sayAndHangup, texml } from "@/lib/server/a1";
import { leadForCall, upsertLead } from "@/lib/server/state";

export const dynamic = "force-dynamic";

/** After-dial callback — records whether the human picked up. */
export async function POST(req: Request) {
  const form = await req.formData();
  const callSid = String(form.get("CallSid") ?? "");
  const dialStatus = String(
    form.get("DialCallStatus") ?? form.get("DialStatus") ?? ""
  );

  const lead = await leadForCall(callSid);

  if (dialStatus === "completed" || dialStatus === "answered") {
    if (lead) {
      lead.status = "qualified";
      lead.callOutcome = "Connected to the team for live intake.";
      await upsertLead(lead);
    }
    return texml(sayAndHangup("Thanks for calling. Goodbye!"));
  }

  if (lead) {
    lead.status = "new";
    lead.callOutcome = `Missed — team didn't pick up (${dialStatus || "no answer"}).`;
    lead.nextAction = "Call the customer back";
    await upsertLead(lead);
  }
  return texml(
    sayAndHangup(
      "Sorry, the team can't come to the phone right now. We have your number and will call you right back!"
    )
  );
}

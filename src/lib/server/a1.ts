// `||` not `??`: an unset key in .env.local arrives as "", which must still fall back.
const BASE = process.env.A1_BASE_URL || "https://hack.a1mobile.com";

export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/sms`, {
      method: "POST",
      headers: {
        "X-Team-Key": process.env.A1_TEAM_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, body }),
    });
    if (!res.ok) {
      // Delivery only works to OTP-verified numbers — expected to fail otherwise.
      console.warn("sms not sent", res.status, (await res.text()).slice(0, 200));
    }
    return res.ok;
  } catch (err) {
    console.warn("sms error", err);
    return false;
  }
}

export function texml(inner: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VOICE = "Polly.Joanna";

/** A <Gather> that speaks `say`, listens for speech, and posts to `action`. */
export function gatherSpeech(say: string, action: string): string {
  return (
    `<Gather input="speech" action="${action}" method="POST" language="en-US" speechTimeout="auto" timeout="6">` +
    `<Say voice="${VOICE}">${escapeXml(say)}</Say>` +
    `</Gather>` +
    // Reached only if the caller stays silent — reprompt via the same action.
    `<Redirect method="POST">${action}</Redirect>`
  );
}

export function sayAndHangup(say: string): string {
  return `<Say voice="${VOICE}">${escapeXml(say)}</Say><Hangup/>`;
}

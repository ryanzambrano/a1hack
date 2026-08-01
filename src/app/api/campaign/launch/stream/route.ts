import { getCampaign, saveCampaign } from "@/lib/server/db";
import { pixeroTool } from "@/lib/server/pixero";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A "success" run only counts as deployed if the report names a Meta
 *  campaign id and doesn't read like a refusal/partial. */
function isDeployed(message: string): boolean {
  const hasCampaignId = /campaign[\s\S]{0,80}?\b\d{10,20}\b|\b\d{10,20}\b[\s\S]{0,40}?campaign/i.test(
    message
  );
  const soundsDone = /publish|launched|created|deployed/i.test(message);
  const soundsBlocked =
    /cannot|can't|unable|couldn'?t|failed|error|need (you|to open)|open the brief|requires an open/i.test(
      message
    );
  return hasCampaignId && soundsDone && !soundsBlocked;
}

/**
 * SSE stream of a Pixero launch task: GET ?threadId=…&runId=…
 * Emits {status, message} every few seconds until the task is terminal.
 * (Pixero exposes no intermediate output — finalMessage is null until done —
 * so the value here is liveness plus the final report the moment it lands.)
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  const runId = url.searchParams.get("runId");
  if (!threadId || !runId) {
    return Response.json({ error: "threadId and runId required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client went away */
        }
      };

      const startedAt = Date.now();
      send({ status: "connected" });
      try {
        while (!req.signal.aborted) {
          // Stay under the function limit; EventSource auto-reconnects and a
          // fresh invocation picks the poll back up.
          if (Date.now() - startedAt > 280_000) break;

          const s = await pixeroTool<{
            status: string;
            finalMessage: string | null;
          }>("get_task_status", { threadId, runId });

          if (s.status === "success") {
            const msg = s.finalMessage ?? "";
            if (isDeployed(msg)) {
              const campaign = await getCampaign();
              if (campaign) {
                await saveCampaign({
                  ...campaign,
                  status: "active",
                  launchedAt: Date.now(),
                });
              }
              send({ status: "deployed", message: msg });
            } else {
              // Agent finished without a verified campaign — caller retries.
              send({ status: "incomplete", message: msg });
            }
            break;
          }
          send({ status: s.status, message: s.finalMessage });
          if (/error|failed/i.test(s.status)) break;
          await sleep(3000);
        }
      } catch (err) {
        send({
          status: "poll_error",
          message: err instanceof Error ? err.message.slice(0, 200) : "poll failed",
        });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

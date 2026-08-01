/**
 * The grounded tools over HTTP.
 *
 * Retell runs its own dialogue model, so it cannot import `tools.ts` — it
 * calls these endpoints as custom functions instead. Both transports
 * therefore price from the same catalog, resolve dates against the same
 * calendar, and write orders through the same path. Neither can invent a
 * number, which is the property that matters.
 */

import { type ToolContext, isToolName, runTool } from "@/lib/agent/tools";
import { emptyState } from "@/lib/agent/ontology";
import { loadCallContext, saveCallState } from "@/lib/agent/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Retell nests the call under `call`; direct callers may pass ids flat. */
interface ToolRequest {
  call?: { call_id?: string; from_number?: string };
  call_id?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function POST(req: Request, ctx: RouteContext<"/api/agent/tools/[tool]">) {
  const { tool } = await ctx.params;
  if (!isToolName(tool)) {
    return Response.json({ ok: false, reason: `Unknown tool ${tool}` }, { status: 404 });
  }

  const body = ((await req.json().catch(() => ({}))) ?? {}) as ToolRequest;
  const { call, call_id: flatId, args: nested, ...flat } = body;
  const args = (nested ?? flat) as Record<string, unknown>;
  const callSid = call?.call_id ?? flatId;

  try {
    // A call we know about carries its accumulated state; anything else runs
    // stateless, which is what the tool tests and one-off lookups want.
    const context = callSid ? await loadCallContext(callSid) : null;
    const toolContext: ToolContext = context
      ? { leadId: context.leadId, phone: context.phone, state: context.state }
      : {
          leadId: "",
          phone: String(call?.from_number ?? ""),
          state: emptyState(),
        };

    const result = await runTool(tool, args, toolContext);

    if (context) await saveCallState(context.leadId, toolContext.state);

    return Response.json(result);
  } catch (err) {
    console.error(`tool endpoint ${tool} failed`, err);
    return Response.json(
      { ok: false, reason: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

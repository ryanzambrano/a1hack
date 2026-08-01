import { toolResultText, withPixeroMcp } from "./pixero-mcp";

export interface AgentToolStep {
  tool: string;
  args: unknown;
  result: string;
}

export interface PixeroAgentRun {
  text: string;
  steps: AgentToolStep[];
}

interface ResponseItem {
  type: string;
  content?: Array<{ type: string; text?: string }>;
  name?: string;
  arguments?: string;
  call_id?: string;
}

const SYSTEM = `You are SweetLeads' marketing agent for a local bakery. You have Pixero tools available (an AI creative/site platform the workspace has connected). Use them to fulfill the user's request — actually call the tools rather than describing what you would do. When a tool returns URLs or IDs, include them in your final answer. Keep the final answer short and concrete.`;

function messageText(output: ResponseItem[]): string {
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

/**
 * Tool-use loop: the a1 gateway LLM plans, Pixero MCP tools execute.
 * One MCP session is held open for the whole run.
 */
export async function runPixeroAgent(
  prompt: string,
  maxSteps = 8
): Promise<PixeroAgentRun> {
  return withPixeroMcp(async (client) => {
    const { tools } = await client.listTools();
    const gatewayTools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    }));

    const steps: AgentToolStep[] = [];
    const input: unknown[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ];

    for (let i = 0; i < maxSteps; i++) {
      const res = await fetch(`${process.env.A1_GATEWAY_BASE}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.A1_GATEWAY_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.A1_MODEL || "openai.gpt-5.6-terra",
          input,
          tools: gatewayTools,
          max_output_tokens: 4000,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        throw new Error(
          `gateway ${res.status}: ${(await res.text()).slice(0, 300)}`
        );
      }

      const output = ((await res.json()) as { output?: ResponseItem[] }).output ?? [];
      const calls = output.filter((item) => item.type === "function_call");

      if (calls.length === 0) {
        return { text: messageText(output), steps };
      }

      // Feed the model's own turn back, then each tool result.
      input.push(...output);
      for (const call of calls) {
        const args = call.arguments ? JSON.parse(call.arguments) : {};
        // Account-scoped writes always target the user-confirmed ad account.
        if (
          (call.name === "meta_launch_action" ||
            call.name === "upload_creative_to_meta") &&
          !args.adAccountId &&
          process.env.PIXERO_AD_ACCOUNT_ID
        ) {
          args.adAccountId = process.env.PIXERO_AD_ACCOUNT_ID;
        }
        let resultText: string;
        try {
          const result = await client.callTool({
            name: call.name!,
            arguments: args,
          });
          resultText = toolResultText(result);
        } catch (err) {
          resultText = `TOOL ERROR: ${err instanceof Error ? err.message : String(err)}`;
        }
        steps.push({ tool: call.name!, args, result: resultText.slice(0, 2000) });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: resultText,
        });
      }
    }

    return {
      text: "Stopped after reaching the tool-call limit; see steps for progress.",
      steps,
    };
  });
}

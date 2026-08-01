import { fullReport } from "@/lib/archive/backtest";
import { loadArchive } from "@/lib/archive/retrieval";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Measures the price estimator against the bakery's own history.
 *
 * Run this before letting the agent quote for a new bakery. If the error is
 * bad, the answer is more calibration data, not a better prompt.
 */
export async function GET() {
  const archive = await loadArchive();
  return Response.json(fullReport(archive));
}

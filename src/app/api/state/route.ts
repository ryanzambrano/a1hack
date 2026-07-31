import { getBakery, getCampaign, listLeads } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The dashboard's whole world in one request — fetched on load, then polled. */
export async function GET() {
  return handle(async () => {
    const [bakery, campaign, leads] = await Promise.all([
      getBakery(),
      getCampaign(),
      listLeads(),
    ]);

    return { bakery, campaign, leads };
  });
}

import { resetAll } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Backs the "Reset demo" button — clears the bakery, campaign, and every lead. */
export async function POST() {
  return handle(async () => {
    await resetAll();
    return { ok: true };
  });
}

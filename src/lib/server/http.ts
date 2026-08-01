import { DomainError } from "./bakery/pricing";

/**
 * Wraps a JSON route handler so a database failure surfaces as a 500, not a
 * crash. A DomainError carries the status the storefront rules chose (400 for a
 * bad cart, 404 for a missing product, 402 for a declined payment) and its
 * message is written for the customer, so it is passed through as-is — the
 * `{ error }` shape is the same either way.
 */
export async function handle<T>(
  fn: () => Promise<T>,
  { status = 200 }: { status?: number } = {}
): Promise<Response> {
  try {
    return Response.json(await fn(), { status });
  } catch (err) {
    if (err instanceof DomainError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 }
    );
  }
}

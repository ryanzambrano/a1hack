import { notFound } from "next/navigation";
import { getProposal, markOpened } from "@/lib/archive/proposals";

export const dynamic = "force-dynamic";

/**
 * What the caller opens on their phone, mid-call.
 *
 * Designed to be understood in the three seconds between "I've just texted
 * you four cakes" and "which number is closest?". Big numbers, one card per
 * option, price band under each, nothing to tap and nothing to fill in — the
 * caller answers out loud, because they are already on the phone.
 */
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const proposal = await getProposal(code);
  if (!proposal) notFound();

  await markOpened(code);

  const money = (cents: number) => `$${Math.round(cents / 100)}`;
  const brief = proposal.brief ?? null;
  const wanted = [
    brief?.occasion,
    brief?.themes?.length ? brief.themes.join(", ") : null,
    brief?.guests ? `${brief.guests} guests` : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <header className="text-center">
        <p className="text-sm font-medium text-rose-600">{proposal.bakeryName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-800">
          Cakes we&rsquo;ve made for you to look at
        </h1>
        {wanted.length > 0 && (
          <p className="mt-2 text-sm text-stone-500">Based on: {wanted.join(" · ")}</p>
        )}
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Stay on the line and just say the number you like.
        </p>
      </header>

      <ol className="mt-6 space-y-5">
        {proposal.options.map((option) => (
          <li
            key={option.position}
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
              proposal.chosenPosition === option.position
                ? "border-rose-500 ring-2 ring-rose-200"
                : "border-stone-200"
            }`}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={option.photoUrl}
                alt={option.title}
                className="h-52 w-full bg-stone-50 object-cover"
              />
              <span className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/85 text-lg font-semibold text-white">
                {option.position}
              </span>
              {option.isSample && (
                <span className="absolute right-3 top-3 rounded-full bg-stone-900/70 px-2 py-0.5 text-xs text-white">
                  sample design
                </span>
              )}
            </div>

            <div className="p-4">
              <p className="text-stone-800">{option.description}</p>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold text-stone-900">
                  {money(option.priceLowCents)} – {money(option.priceHighCents)}
                </span>
                {option.servings && (
                  <span className="text-sm text-stone-500">serves about {option.servings}</span>
                )}
              </div>
              {option.aboveBudget && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  A step up from the budget you mentioned — included so you can see the difference.
                </p>
              )}
              {option.hasNameText && (
                <p className="mt-2 text-xs text-stone-500">
                  This is a cake we made for another customer — we&rsquo;d pipe your name instead.
                </p>
              )}
              <p className="mt-2 text-xs text-stone-400">
                {[...option.techniques].join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-center text-xs text-stone-400">
        Prices are estimates based on similar cakes we&rsquo;ve made. The bakery confirms the final
        quote.
      </p>
    </main>
  );
}

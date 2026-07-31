import Link from "next/link";

const FEATURES = [
  {
    icon: "📣",
    title: "Launch Meta campaigns",
    body: "Generate ad copy and audiences tuned to your bakery, then launch in a click.",
  },
  {
    icon: "📞",
    title: "AI calls every lead",
    body: "A voice agent rings new leads within minutes, qualifies them, and books the order.",
  },
  {
    icon: "🧁",
    title: "Orders, not spreadsheets",
    body: "Qualified cake orders land in your dashboard with budget, date, and flavor notes.",
  },
];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-stone-200 bg-white/90">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:px-6">
          <span className="text-xl">🍰</span>
          <span className="font-semibold text-stone-800">
            Sweet<span className="text-rose-600">Leads</span>
          </span>
          <Link
            href="/login"
            className="ml-auto rounded-full border border-stone-200 px-4 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="text-5xl">🍰</span>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-stone-800 sm:text-5xl">
          Turn Meta ads into qualified cake orders
        </h1>
        <p className="mt-4 max-w-xl text-lg text-stone-500">
          SweetLeads runs your ads and calls every lead for you — so your bakery
          books more orders without you touching the phone.
        </p>
        <Link
          href="/login"
          className="mt-8 rounded-full bg-rose-600 px-6 py-3 font-medium text-white transition-colors hover:bg-rose-700"
        >
          Get started
        </Link>

        <div className="mt-20 grid w-full gap-6 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-stone-200 bg-white p-6"
            >
              <span className="text-2xl">{f.icon}</span>
              <h2 className="mt-3 font-semibold text-stone-800">{f.title}</h2>
              <p className="mt-1 text-sm text-stone-500">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

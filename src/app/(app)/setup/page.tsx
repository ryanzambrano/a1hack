"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Fulfillment } from "@/lib/types";

const CAKE_TYPE_OPTIONS = [
  "Birthday",
  "Wedding",
  "Custom / themed",
  "Cupcakes",
  "Cheesecake",
  "Vegan & gluten-free",
];

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200";

export default function SetupPage() {
  const { bakery, saveBakery, hydrated, busy } = useApp();
  const router = useRouter();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [cakeTypes, setCakeTypes] = useState<string[]>([
    "Birthday",
    "Custom / themed",
    "Cupcakes",
  ]);
  const [priceMin, setPriceMin] = useState(45);
  const [priceMax, setPriceMax] = useState(350);
  const [fulfillment, setFulfillment] = useState<Fulfillment[]>([
    "pickup",
    "delivery",
  ]);
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState(300);

  // Populate the form from the saved profile ONCE — the store re-polls every
  // few seconds, and re-syncing on every poll would overwrite what the user
  // is currently typing.
  const formInitialized = useRef(false);
  useEffect(() => {
    if (!hydrated || !bakery || formInitialized.current) return;
    formInitialized.current = true;
    setName(bakery.name);
    setLocation(bakery.location);
    setCakeTypes(bakery.cakeTypes);
    setPriceMin(bakery.priceMin);
    setPriceMax(bakery.priceMax);
    setFulfillment(bakery.fulfillment);
    setPhone(bakery.phone);
    setHours(bakery.hours);
    setMonthlyBudget(bakery.monthlyBudget);
  }, [hydrated, bakery]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const valid =
    name.trim() &&
    location.trim() &&
    cakeTypes.length > 0 &&
    fulfillment.length > 0 &&
    phone.trim() &&
    monthlyBudget > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    // saveBakery persists the profile and generates the ad campaign with the LLM.
    await saveBakery({
      name: name.trim(),
      location: location.trim(),
      cakeTypes,
      priceMin,
      priceMax,
      fulfillment,
      phone: phone.trim(),
      hours: hours.trim(),
      monthlyBudget,
    });
    router.push("/campaign");
  };

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-semibold text-stone-800">Bakery Setup</h1>
      <p className="mt-1 text-sm text-stone-500">
        Tell us about your bakery. We&apos;ll use this to generate your ad
        campaign and brief your AI calling agent.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:grid-cols-2"
      >
        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Bakery name
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sweet Street Bakery"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Location
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Austin, TX"
          />
        </label>

        <div className="grid gap-1.5 text-sm font-medium text-stone-700 sm:col-span-2">
          Cake types offered
          <div className="flex flex-wrap gap-2">
            {CAKE_TYPE_OPTIONS.map((type) => {
              const on = cakeTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCakeTypes((c) => toggle(c, type))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-stone-300 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1.5 text-sm font-medium text-stone-700">
          Price range
          <div className="flex items-center gap-2">
            <span className="text-stone-400">$</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={priceMin}
              onChange={(e) => setPriceMin(Number(e.target.value))}
            />
            <span className="text-stone-400">to $</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={priceMax}
              onChange={(e) => setPriceMax(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid gap-1.5 text-sm font-medium text-stone-700">
          Delivery / pickup
          <div className="flex gap-2">
            {(["pickup", "delivery"] as Fulfillment[]).map((f) => {
              const on = fulfillment.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFulfillment((c) => toggle(c, f))}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
                    on
                      ? "border-rose-600 bg-rose-50 text-rose-700"
                      : "border-stone-300 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Phone number
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(512) 555-0148"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Hours
          <input
            className={inputClass}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Tue–Sun, 8 AM – 6 PM"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-stone-700">
          Monthly ad budget
          <div className="flex items-center gap-2">
            <span className="text-stone-400">$</span>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Number(e.target.value))}
            />
            <span className="whitespace-nowrap text-xs text-stone-400">
              ≈ ${Math.max(5, Math.round(monthlyBudget / 30))}/day
            </span>
          </div>
        </label>

        <div className="flex items-end sm:col-span-2">
          <button
            type="submit"
            disabled={!valid || busy}
            className="w-full rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {busy ? "Generating your campaign…" : "Save & generate campaign →"}
          </button>
        </div>
      </form>
    </div>
  );
}

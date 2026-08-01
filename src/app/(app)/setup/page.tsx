"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { IconArrowRight, IconCheck } from "@/components/icons";
import {
  Button,
  Card,
  CardFooter,
  CardHeader,
  Chip,
  Field,
  Input,
  SectionLabel,
} from "@/components/ui";
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
    <div className="animate-fade-up mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-1000">Bakery profile</h1>
      <p className="mt-1 text-sm text-gray-900">
        This record is the source of truth for both the ad campaign and the
        calling agent&apos;s brief.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        <Card>
          <CardHeader
            title="Identity"
            description="Shown in the ad unit and spoken by the agent on every call."
          />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Field label="Bakery name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sweet Street Bakery"
              />
            </Field>
            <Field label="Location">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Austin, TX"
              />
            </Field>
            <Field label="Phone number">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(512) 555-0148"
                inputMode="tel"
                className="font-mono tnum"
              />
            </Field>
            <Field label="Hours" hint="Optional — quoted when a caller asks.">
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Tue–Sun, 8 AM – 6 PM"
              />
            </Field>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="Catalog"
            description="Constrains what the agent will quote and take orders for."
          />
          <div className="grid gap-5 px-5 py-4">
            <div className="grid gap-2">
              <SectionLabel>Cake types offered</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {CAKE_TYPE_OPTIONS.map((type) => {
                  const on = cakeTypes.includes(type);
                  return (
                    <Chip
                      key={type}
                      selected={on}
                      onClick={() => setCakeTypes((c) => toggle(c, type))}
                    >
                      {on && <IconCheck className="size-3" />}
                      {type}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <SectionLabel>Price range</SectionLabel>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">$</span>
                  <Input
                    type="number"
                    min={1}
                    value={priceMin}
                    onChange={(e) => setPriceMin(Number(e.target.value))}
                    className="tnum"
                  />
                  <span className="shrink-0 text-sm text-gray-700">to $</span>
                  <Input
                    type="number"
                    min={1}
                    value={priceMax}
                    onChange={(e) => setPriceMax(Number(e.target.value))}
                    className="tnum"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <SectionLabel>Fulfillment</SectionLabel>
                <div className="flex gap-1.5">
                  {(["pickup", "delivery"] as Fulfillment[]).map((f) => {
                    const on = fulfillment.includes(f);
                    return (
                      <Chip
                        key={f}
                        selected={on}
                        onClick={() => setFulfillment((c) => toggle(c, f))}
                        className="capitalize"
                      >
                        {on && <IconCheck className="size-3" />}
                        {f}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader title="Spend" />
          <div className="px-5 py-4">
            <Field
              label="Monthly ad budget"
              hint={`≈ $${Math.max(5, Math.round(monthlyBudget / 30))}/day across Facebook & Instagram`}
              className="max-w-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">$</span>
                <Input
                  type="number"
                  min={1}
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                  className="tnum"
                />
              </div>
            </Field>
          </div>
          <CardFooter>
            <p className="text-xs text-gray-700">
              Saving regenerates the ad creative from this profile.
            </p>
            <Button
              type="submit"
              variant="primary"
              disabled={!valid}
              loading={busy}
              prefix={busy ? undefined : <IconArrowRight />}
            >
              {busy ? "Generating campaign…" : "Save & generate campaign"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

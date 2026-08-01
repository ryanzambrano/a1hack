"use client";

/**
 * The bakery intake form.
 *
 * This is the only place the product learns anything about the business, and
 * two very different consumers read it: the ad generator, which needs the
 * things that make this bakery worth clicking on, and the phone agent, which
 * needs the answers callers ask for out loud — lead time, allergens, delivery
 * radius, deposit. So the questionnaire is long on purpose, and organised the
 * way a baker thinks about their shop rather than the way the table is
 * columned. Nine sections, a jump rail, and a running count of what is still
 * blank; only a handful of fields actually block saving.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { IconArrowRight, IconCheck } from "@/components/icons";
import {
  Button,
  Card,
  CardHeader,
  Chip,
  Field,
  Input,
  SectionLabel,
  Select,
  Textarea,
  cx,
} from "@/components/ui";
import { quoteDelivery, zoneFromProfile } from "@/lib/delivery";
import {
  ALLERGEN_OPTIONS,
  CAKE_TYPE_OPTIONS,
  DECORATION_OPTIONS,
  DEFAULT_BAKERY,
  DELIVERY_PRICING_OPTIONS,
  DIETARY_OPTIONS,
  FILLING_OPTIONS,
  FLAVOR_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PEAK_SEASON_OPTIONS,
  TARGET_CUSTOMER_OPTIONS,
  TONE_OPTIONS,
  WEEKDAYS,
  describeHours,
  formatHour,
} from "@/lib/bakery-profile";
import { useApp } from "@/lib/store";
import type { Bakery, Fulfillment } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `answers` lists the fields the section asks about, so the rail can show how
 * much of it is filled in. Booleans are excluded — a toggle always has a
 * value, and counting it as "answered" would flatter an empty profile.
 */
const SECTIONS = [
  {
    id: "identity",
    title: "Identity & story",
    description: "Spoken by the agent on every call and printed in the ad unit.",
    answers: (b: Bakery) => [
      b.name,
      b.location,
      b.address,
      b.phone,
      b.email,
      b.description,
      b.website,
      b.instagram,
      b.foundedYear,
    ],
  },
  {
    id: "hours",
    title: "Hours & cutoff",
    description:
      "Drives the pickup windows the agent may offer and the days it may not.",
    answers: (b: Bakery) => [b.openHour, b.closeHour, b.orderCutoffHour],
  },
  {
    id: "menu",
    title: "What you bake",
    description:
      "The kitchen's range. Constrains what the agent will discuss on a custom cake.",
    answers: (b: Bakery) => [
      b.cakeTypes,
      b.flavors,
      b.fillings,
      b.decorations,
      b.maxTiers,
      b.minServings,
      b.maxServings,
      b.signatureItems,
    ],
  },
  {
    id: "dietary",
    title: "Dietary & allergens",
    description:
      "The most common reason a call goes wrong. The agent repeats this verbatim.",
    answers: (b: Bakery) => [b.dietaryOptions, b.allergensOnSite],
  },
  {
    id: "capacity",
    title: "Capacity & lead times",
    description: "How much notice you need, and how much work you can take.",
    answers: (b: Bakery) => [
      b.leadTimeDays,
      b.weddingLeadTimeDays,
      b.rushFeeUsd,
      b.weeklyCakeCapacity,
      b.peakSeasons,
    ],
  },
  {
    id: "fulfillment",
    title: "Pickup & delivery",
    description: "How far you'll drive, and what you charge to do it.",
    answers: (b: Bakery) => [b.fulfillment, b.deliveryRadiusMiles, b.deliveryPricing],
  },
  {
    id: "pricing",
    title: "Pricing & payment",
    description:
      "The band the agent may quote inside, and where it stops and hands off.",
    answers: (b: Bakery) => [
      b.priceMin,
      b.priceMax,
      b.pricePerServing,
      b.customQuoteThresholdUsd,
      b.depositPercent,
      b.paymentMethods,
      b.cancellationDays,
    ],
  },
  {
    id: "agent",
    title: "Phone agent brief",
    description: "How the agent sounds, and the lines it must never cross.",
    answers: (b: Bakery) => [
      b.tone,
      b.greeting,
      b.differentiators,
      b.doNotPromise,
      b.escalationContact,
    ],
  },
  {
    id: "ads",
    title: "Ads & audience",
    description: "Budget and targeting for the lead campaign.",
    answers: (b: Bakery) => [
      b.monthlyBudget,
      b.targetCustomers,
      b.adRadiusMiles,
      b.currentOffer,
    ],
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const answered = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : typeof value === "number"
      ? value > 0
      : String(value ?? "").trim().length > 0;

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function SetupPage() {
  const { bakery, saveBakery, hydrated, busy } = useApp();
  const router = useRouter();

  const [form, setForm] = useState<Bakery>(DEFAULT_BAKERY);
  const set = <K extends keyof Bakery>(key: K, value: Bakery[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: keyof Bakery, value: string) =>
    setForm((f) => {
      const list = f[key] as string[];
      return {
        ...f,
        [key]: list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value],
      };
    });

  // Populate from the saved profile ONCE — the store re-polls every few
  // seconds, and re-syncing on every poll would overwrite what is being typed.
  const initialized = useRef(false);
  useEffect(() => {
    if (!hydrated || !bakery || initialized.current) return;
    initialized.current = true;
    setForm({ ...DEFAULT_BAKERY, ...bakery });
  }, [hydrated, bakery]);

  const hours = describeHours(form.openHour, form.closeHour, form.closedWeekdays);

  const progress = useMemo(() => {
    const per = SECTIONS.map((s) => {
      const values = s.answers(form);
      return {
        id: s.id,
        done: values.filter(answered).length,
        total: values.length,
      };
    });
    return {
      per,
      done: per.reduce((n, s) => n + s.done, 0),
      total: per.reduce((n, s) => n + s.total, 0),
    };
  }, [form]);

  // Only the things that genuinely break something downstream block a save.
  const missing: string[] = [];
  if (!form.name.trim()) missing.push("bakery name");
  if (!form.location.trim()) missing.push("city");
  if (!form.phone.trim()) missing.push("phone number");
  if (!form.cakeTypes.length) missing.push("at least one cake type");
  if (!form.fulfillment.length) missing.push("pickup or delivery");
  if (form.priceMax <= form.priceMin) missing.push("a price range that goes up");
  if (form.closeHour <= form.openHour) missing.push("a closing hour after opening");
  if (form.closedWeekdays.length === 7) missing.push("at least one open day");
  if (form.monthlyBudget <= 0) missing.push("a monthly ad budget");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    // saveBakery persists the profile and regenerates the ad campaign.
    await saveBakery({
      ...form,
      name: form.name.trim(),
      location: form.location.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      hours,
    });
    router.push("/campaign");
  };

  return (
    <div className="animate-fade-up mx-auto w-full max-w-5xl pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-1000">Bakery profile</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-900">
            The source of truth for both the ad campaign and the calling
            agent&apos;s brief. Every question you answer is one the agent
            doesn&apos;t have to promise to call back about.
          </p>
        </div>
        <Progress done={progress.done} total={progress.total} />
      </header>

      <div className="mt-6 gap-8 lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:items-start">
        <nav className="sticky top-16 hidden lg:block">
          <SectionLabel>Sections</SectionLabel>
          <ul className="mt-2 grid gap-0.5">
            {SECTIONS.map((s) => {
              const p = progress.per.find((x) => x.id === s.id)!;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-gray-900 transition-colors hover:bg-alpha-100 hover:text-gray-1000"
                  >
                    <span className="truncate">{s.title}</span>
                    <span
                      className={cx(
                        "shrink-0 font-mono text-[11px] tnum",
                        p.done === p.total ? "text-green-900" : "text-gray-700",
                      )}
                    >
                      {p.done}/{p.total}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* ---------------------------------------------------------------- */}
          <Section id="identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bakery name">
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Sweet Street Bakery"
                />
              </Field>
              <Field label="City" hint="Used to centre the ad targeting.">
                <Input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Austin, TX"
                />
              </Field>
              <Field label="Street address" className="sm:col-span-2">
                <Input
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="1408 South Congress Ave, Austin, TX 78704"
                />
              </Field>
              <Field label="Phone number">
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(512) 555-0148"
                  inputMode="tel"
                  className="font-mono tnum"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="hello@sweetstreetbakery.com"
                  inputMode="email"
                />
              </Field>
              <Field label="Website">
                <Input
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="sweetstreetbakery.com"
                />
              </Field>
              <Field label="Instagram">
                <Input
                  value={form.instagram}
                  onChange={(e) => set("instagram", e.target.value)}
                  placeholder="@sweetstreetatx"
                />
              </Field>
              <Field
                label="Baking here since"
                hint="Optional — a real year is good ad copy."
              >
                <NumberInput
                  value={form.foundedYear}
                  onChange={(v) => set("foundedYear", v)}
                  min={1800}
                  max={new Date().getFullYear()}
                  placeholder="2014"
                />
              </Field>
              <Field
                label="How you'd describe the bakery"
                hint="Two lines. The ad generator writes from this."
                className="sm:col-span-2"
              >
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="A small craft bakery in the middle of town. Everything is made from scratch, every morning."
                />
              </Field>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="hours">
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Opens at">
                  <HourSelect
                    value={form.openHour}
                    onChange={(v) => set("openHour", v)}
                  />
                </Field>
                <Field label="Closes at">
                  <HourSelect
                    value={form.closeHour}
                    onChange={(v) => set("closeHour", v)}
                  />
                </Field>
                <Field
                  label="Same-day order cutoff"
                  hint="After this, lead time starts counting tomorrow."
                >
                  <HourSelect
                    value={form.orderCutoffHour}
                    onChange={(v) => set("orderCutoffHour", v)}
                  />
                </Field>
              </div>

              <div className="grid gap-2">
                <SectionLabel>Closed on</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const on = form.closedWeekdays.includes(d.value);
                    return (
                      <Chip
                        key={d.value}
                        selected={on}
                        onClick={() =>
                          set(
                            "closedWeekdays",
                            on
                              ? form.closedWeekdays.filter((v) => v !== d.value)
                              : [...form.closedWeekdays, d.value],
                          )
                        }
                      >
                        {on && <IconCheck className="size-3" />}
                        {d.short}
                      </Chip>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-900">
                  The agent will say:{" "}
                  <span className="font-medium text-gray-1000">{hours}</span>
                </p>
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="menu">
            <div className="grid gap-5">
              <ChipField
                label="Cake types you take orders for"
                options={CAKE_TYPE_OPTIONS}
                selected={form.cakeTypes}
                onToggle={(v) => toggleIn("cakeTypes", v)}
              />
              <ChipField
                label="Flavors the kitchen can do"
                options={FLAVOR_OPTIONS}
                selected={form.flavors}
                onToggle={(v) => toggleIn("flavors", v)}
              />
              <ChipField
                label="Fillings & frostings"
                options={FILLING_OPTIONS}
                selected={form.fillings}
                onToggle={(v) => toggleIn("fillings", v)}
              />
              <ChipField
                label="Decoration you do in-house"
                hint="What you say no to matters as much as what you say yes to."
                options={DECORATION_OPTIONS}
                selected={form.decorations}
                onToggle={(v) => toggleIn("decorations", v)}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Smallest cake" hint="Servings">
                  <NumberInput
                    value={form.minServings}
                    onChange={(v) => set("minServings", v)}
                    min={1}
                  />
                </Field>
                <Field label="Largest cake" hint="Servings">
                  <NumberInput
                    value={form.maxServings}
                    onChange={(v) => set("maxServings", v)}
                    min={1}
                  />
                </Field>
                <Field label="Most tiers you'll stack">
                  <NumberInput
                    value={form.maxTiers}
                    onChange={(v) => set("maxTiers", v)}
                    min={1}
                    max={10}
                  />
                </Field>
              </div>

              <Field
                label="Signature bakes"
                hint="The two or three things people come to you for."
              >
                <Textarea
                  rows={2}
                  value={form.signatureItems}
                  onChange={(e) => set("signatureItems", e.target.value)}
                  placeholder="Berry cream layer cake, brown-butter carrot cake, tres leches sheet cake"
                />
              </Field>

              <Toggle
                label="Wedding tastings"
                value={form.tastingsOffered}
                onChange={(v) => set("tastingsOffered", v)}
                yes="We offer tastings"
                no="No tastings"
              />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="dietary">
            <div className="grid gap-5">
              <ChipField
                label="Dietary versions you can actually bake"
                options={DIETARY_OPTIONS}
                selected={form.dietaryOptions}
                onToggle={(v) => toggleIn("dietaryOptions", v)}
              />
              <Toggle
                label="Kitchen"
                hint="If it's shared, the agent says so before agreeing to anything allergy-related."
                value={form.sharedKitchen}
                onChange={(v) => set("sharedKitchen", v)}
                yes="Shared kitchen"
                no="Fully segregated"
              />
              {form.sharedKitchen && (
                <ChipField
                  label="Allergens handled in the kitchen"
                  options={ALLERGEN_OPTIONS}
                  selected={form.allergensOnSite}
                  onToggle={(v) => toggleIn("allergensOnSite", v)}
                />
              )}
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="capacity">
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Notice for a custom cake" hint="Days">
                  <NumberInput
                    value={form.leadTimeDays}
                    onChange={(v) => set("leadTimeDays", v)}
                    min={0}
                  />
                </Field>
                <Field label="Notice for a wedding cake" hint="Days">
                  <NumberInput
                    value={form.weddingLeadTimeDays}
                    onChange={(v) => set("weddingLeadTimeDays", v)}
                    min={0}
                  />
                </Field>
                <Field label="Custom cakes a week" hint="Your realistic ceiling.">
                  <NumberInput
                    value={form.weeklyCakeCapacity}
                    onChange={(v) => set("weeklyCakeCapacity", v)}
                    min={1}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle
                  label="Rush orders"
                  value={form.rushAvailable}
                  onChange={(v) => set("rushAvailable", v)}
                  yes="Sometimes possible"
                  no="Never"
                />
                {form.rushAvailable && (
                  <Field label="Rush fee">
                    <NumberInput
                      value={form.rushFeeUsd}
                      onChange={(v) => set("rushFeeUsd", v)}
                      min={0}
                      prefix="$"
                    />
                  </Field>
                )}
              </div>

              <ChipField
                label="Seasons you're already slammed"
                hint="The campaign steers spend away from these."
                options={PEAK_SEASON_OPTIONS}
                selected={form.peakSeasons}
                onToggle={(v) => toggleIn("peakSeasons", v)}
              />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="fulfillment">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <SectionLabel>How customers get the cake</SectionLabel>
                <div className="flex gap-1.5">
                  {(["pickup", "delivery"] as Fulfillment[]).map((f) => {
                    const on = form.fulfillment.includes(f);
                    return (
                      <Chip
                        key={f}
                        selected={on}
                        onClick={() =>
                          set(
                            "fulfillment",
                            on
                              ? form.fulfillment.filter((v) => v !== f)
                              : [...form.fulfillment, f],
                          )
                        }
                        className="capitalize"
                      >
                        {on && <IconCheck className="size-3" />}
                        {f}
                      </Chip>
                    );
                  })}
                </div>
              </div>

              {form.fulfillment.includes("delivery") && (
                <div className="grid gap-4 rounded-lg border border-gray-400 p-4">
                  <div>
                    <SectionLabel>Your delivery zone</SectionLabel>
                    <p className="mt-1 text-xs text-gray-900">
                      How far you&apos;ll drive, and what that costs. The agent
                      measures the caller&apos;s address against this on the
                      call — it never guesses a fee or whether someone is in
                      range.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="How far you'll deliver"
                      hint="Straight-line miles from your door."
                    >
                      <NumberInput
                        value={form.deliveryRadiusMiles}
                        onChange={(v) => set("deliveryRadiusMiles", v)}
                        min={1}
                        suffix="miles"
                      />
                    </Field>
                    <Field
                      label="Minimum order to deliver"
                      hint="0 if you'll drive out for anything."
                    >
                      <NumberInput
                        value={form.deliveryMinimumUsd}
                        onChange={(v) => set("deliveryMinimumUsd", v)}
                        min={0}
                        prefix="$"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-2">
                    <SectionLabel>What you charge for it</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {DELIVERY_PRICING_OPTIONS.map((option) => {
                        const on = form.deliveryPricing === option.value;
                        return (
                          <Chip
                            key={option.value}
                            selected={on}
                            onClick={() => set("deliveryPricing", option.value)}
                          >
                            {on && <IconCheck className="size-3" />}
                            {option.label}
                          </Chip>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-900">
                      {
                        DELIVERY_PRICING_OPTIONS.find(
                          (o) => o.value === form.deliveryPricing,
                        )?.hint
                      }
                    </p>
                  </div>

                  {form.deliveryPricing === "per_mile" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Price per mile">
                        <NumberInput
                          value={form.deliveryPerMileUsd}
                          onChange={(v) => set("deliveryPerMileUsd", v)}
                          min={0}
                          prefix="$"
                          suffix="/ mile"
                        />
                      </Field>
                      <Field
                        label="Call-out fee"
                        hint="Charged on top, before the miles. 0 if none."
                      >
                        <NumberInput
                          value={form.deliveryBaseFeeUsd}
                          onChange={(v) => set("deliveryBaseFeeUsd", v)}
                          min={0}
                          prefix="$"
                        />
                      </Field>
                    </div>
                  )}

                  {form.deliveryPricing === "flat" && (
                    <Field
                      label="Delivery fee"
                      hint="The same anywhere inside the zone."
                    >
                      <NumberInput
                        value={form.deliveryFeeUsd}
                        onChange={(v) => set("deliveryFeeUsd", v)}
                        min={0}
                        prefix="$"
                      />
                    </Field>
                  )}

                  <DeliveryPreview bakery={form} />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Toggle
                  label="Wedding venue setup"
                  value={form.weddingSetup}
                  onChange={(v) => set("weddingSetup", v)}
                  yes="We deliver & stack on site"
                  no="Collection only"
                />
                <Toggle
                  label="Nationwide shipping"
                  value={form.nationwideShipping}
                  onChange={(v) => set("nationwideShipping", v)}
                  yes="We ship"
                  no="Local only"
                />
              </div>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="pricing">
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <SectionLabel>Typical price range</SectionLabel>
                  <div className="flex items-center gap-2">
                    <NumberInput
                      value={form.priceMin}
                      onChange={(v) => set("priceMin", v)}
                      min={1}
                      prefix="$"
                    />
                    <span className="shrink-0 text-sm text-gray-700">to</span>
                    <NumberInput
                      value={form.priceMax}
                      onChange={(v) => set("priceMax", v)}
                      min={1}
                      prefix="$"
                    />
                  </div>
                </div>
                <Field
                  label="Price per serving"
                  hint="What a custom cake works out to per head."
                >
                  <NumberInput
                    value={form.pricePerServing}
                    onChange={(v) => set("pricePerServing", v)}
                    min={1}
                    prefix="$"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Quote by hand above"
                  hint="The agent stops quoting and hands off."
                >
                  <NumberInput
                    value={form.customQuoteThresholdUsd}
                    onChange={(v) => set("customQuoteThresholdUsd", v)}
                    min={0}
                    prefix="$"
                  />
                </Field>
                <Field label="Deposit to confirm an order">
                  <NumberInput
                    value={form.depositPercent}
                    onChange={(v) => set("depositPercent", v)}
                    min={0}
                    max={100}
                    suffix="%"
                  />
                </Field>
                <Field label="Free cancellation up to" hint="Days before pickup.">
                  <NumberInput
                    value={form.cancellationDays}
                    onChange={(v) => set("cancellationDays", v)}
                    min={0}
                  />
                </Field>
              </div>

              <ChipField
                label="Payment you accept"
                options={PAYMENT_METHOD_OPTIONS}
                selected={form.paymentMethods}
                onToggle={(v) => toggleIn("paymentMethods", v)}
              />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="agent">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <SectionLabel>How the agent should sound</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((t) => (
                    <Chip
                      key={t}
                      selected={form.tone === t}
                      onClick={() => set("tone", t)}
                    >
                      {form.tone === t && <IconCheck className="size-3" />}
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>

              <Field
                label="Greeting"
                hint="Optional. Left blank, the agent opens with your bakery name."
              >
                <Input
                  value={form.greeting}
                  onChange={(e) => set("greeting", e.target.value)}
                  placeholder="Thanks for calling Sweet Street, what are we celebrating?"
                />
              </Field>

              <Field
                label="What sets you apart"
                hint="The reason to choose you over the supermarket."
              >
                <Textarea
                  rows={2}
                  value={form.differentiators}
                  onChange={(e) => set("differentiators", e.target.value)}
                  placeholder="Everything is scratch-baked each morning, and every custom cake is sketched with the customer before it's quoted."
                />
              </Field>

              <Field
                label="Things the agent must never promise"
                hint="Written straight into the agent's rules, not just its prompt hints."
              >
                <Textarea
                  rows={2}
                  value={form.doNotPromise}
                  onChange={(e) => set("doNotPromise", e.target.value)}
                  placeholder="A same-day wedding cake, a guaranteed allergen-free cake, any discount over 10%."
                />
              </Field>

              <Field
                label="Who a call gets handed to"
                hint="Named on the handoff so the customer hears a real person's name."
              >
                <Input
                  value={form.escalationContact}
                  onChange={(e) => set("escalationContact", e.target.value)}
                  placeholder="Nadia, head baker — (512) 555-0148"
                />
              </Field>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="ads">
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Monthly ad budget"
                  hint={`≈ $${Math.max(5, Math.round(form.monthlyBudget / 30))}/day across Facebook & Instagram`}
                >
                  <NumberInput
                    value={form.monthlyBudget}
                    onChange={(v) => set("monthlyBudget", v)}
                    min={1}
                    prefix="$"
                  />
                </Field>
                <Field label="Advertise within" hint="Miles around your city.">
                  <NumberInput
                    value={form.adRadiusMiles}
                    onChange={(v) => set("adRadiusMiles", v)}
                    min={1}
                  />
                </Field>
              </div>

              <ChipField
                label="Customers you want more of"
                options={TARGET_CUSTOMER_OPTIONS}
                selected={form.targetCustomers}
                onToggle={(v) => toggleIn("targetCustomers", v)}
              />

              <Field
                label="Offer to feature"
                hint="Optional. Goes in the ad body if you set one."
              >
                <Input
                  value={form.currentOffer}
                  onChange={(e) => set("currentOffer", e.target.value)}
                  placeholder="Free personalised message piping on any cake this month"
                />
              </Field>
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <div className="sticky bottom-4 z-10 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-background/90 px-5 py-3 shadow-small backdrop-blur-md">
            <p className="text-xs text-gray-900">
              {missing.length
                ? `Still needed: ${missing.join(", ")}.`
                : "Saving rewrites the ad creative and re-briefs the calling agent."}
            </p>
            <Button
              type="submit"
              variant="primary"
              disabled={missing.length > 0}
              loading={busy}
              prefix={busy ? undefined : <IconArrowRight />}
            >
              {busy ? "Generating campaign…" : "Save & generate campaign"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const meta = SECTIONS.find((s) => s.id === id)!;
  return (
    <Card id={id} className="scroll-mt-16">
      <CardHeader title={meta.title} description={meta.description} />
      <div className="px-5 py-4">{children}</div>
    </Card>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="min-w-44">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-micro">Profile complete</span>
        <span className="font-mono text-xs text-gray-1000 tnum">
          {done}/{total}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-alpha-200">
        <div
          className="h-full rounded-full bg-honey transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The zone, priced at three distances.
 *
 * A rate per mile is hard to feel — "$2 a mile" sounds like nothing until it
 * is a $29 delivery. These are the same numbers the agent will quote on a
 * call, computed by the same function, so what the baker sees here is exactly
 * what a caller will hear.
 */
function DeliveryPreview({ bakery }: { bakery: Bakery }) {
  const zone = zoneFromProfile(bakery);
  const radius = Math.max(1, Math.round(zone.radiusMiles));
  const samples = [...new Set([1, Math.round(radius / 2), radius])].filter(
    (m) => m >= 1 && m <= radius,
  );
  const placed = bakery.latitude !== 0 || bakery.longitude !== 0;

  return (
    <div className="rounded-md bg-alpha-100 px-3 py-2.5">
      <p className="label-micro">What a caller hears</p>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-3">
        {samples.map((miles) => (
          <li key={miles} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-900">{miles} mi out</span>
            <span className="font-mono text-gray-1000 tnum">
              ${(quoteDelivery(zone, miles).feeCents / 100).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-700">
        {placed
          ? "Measured from your address. Beyond the zone, the agent offers collection instead."
          : "Save to place your address on the map — distance pricing needs it."}
      </p>
    </div>
  );
}

function ChipField({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <Chip key={option} selected={on} onClick={() => onToggle(option)}>
              {on && <IconCheck className="size-3" />}
              {option}
            </Chip>
          );
        })}
      </div>
      {hint && <p className="text-xs text-gray-900">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  yes,
  no,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  yes: string;
  no: string;
}) {
  return (
    <div className="grid gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <Chip selected={value} onClick={() => onChange(true)}>
          {value && <IconCheck className="size-3" />}
          {yes}
        </Chip>
        <Chip selected={!value} onClick={() => onChange(false)}>
          {!value && <IconCheck className="size-3" />}
          {no}
        </Chip>
      </div>
      {hint && <p className="text-xs text-gray-900">{hint}</p>}
    </div>
  );
}

/**
 * A number input that keeps its own text while being edited. Coercing on every
 * keystroke turns a cleared field into 0 and traps the cursor behind it.
 */
function NumberInput({
  value,
  onChange,
  min,
  max,
  prefix,
  suffix,
  placeholder,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  // null means "follow the model" — a draft only exists while the field is
  // being edited, so a profile loaded underneath still shows through.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1.5">
      {prefix && <span className="shrink-0 text-sm text-gray-700">{prefix}</span>}
      <Input
        type="number"
        min={min}
        max={max}
        value={draft ?? (value ? String(value) : "")}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value === "" ? 0 : Number(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        className="tnum"
      />
      {suffix && <span className="shrink-0 text-sm text-gray-700">{suffix}</span>}
    </div>
  );
}

function HourSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {formatHour(h)}
        </option>
      ))}
    </Select>
  );
}

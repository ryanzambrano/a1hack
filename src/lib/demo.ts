import type { CakeOrder, Lead, TranscriptMessage } from "./types";

interface CallStep extends TranscriptMessage {
  delay: number; // ms before this line appears
}

export function buildCallScript(bakeryName: string, lead: Lead): CallStep[] {
  const firstName = lead.name.split(" ")[0];
  return [
    {
      speaker: "agent",
      delay: 1600,
      text: `Hi ${firstName}, I'm calling on behalf of ${bakeryName} about your cake request. Can I ask you a few quick questions?`,
    },
    { speaker: "customer", delay: 1800, text: "Oh hi! Yes, of course." },
    {
      speaker: "agent",
      delay: 1500,
      text: "Wonderful! What's the occasion?",
    },
    {
      speaker: "customer",
      delay: 2000,
      text: "It's my daughter's birthday — she's turning six.",
    },
    {
      speaker: "agent",
      delay: 1600,
      text: "Happy early birthday to her! What date is the party?",
    },
    { speaker: "customer", delay: 1500, text: "August 15th." },
    {
      speaker: "agent",
      delay: 1400,
      text: "Got it. About how many guests are you expecting?",
    },
    { speaker: "customer", delay: 1500, text: "Around 30 people." },
    {
      speaker: "agent",
      delay: 1800,
      text: "For 30 guests, a two-tier cake is usually perfect. What flavor were you thinking?",
    },
    {
      speaker: "customer",
      delay: 1700,
      text: "Chocolate — she absolutely loves chocolate.",
    },
    {
      speaker: "agent",
      delay: 1500,
      text: "Great choice. Any design or theme in mind?",
    },
    {
      speaker: "customer",
      delay: 2000,
      text: "A pink princess theme, with her name Lily on it.",
    },
    {
      speaker: "agent",
      delay: 1500,
      text: "That sounds adorable. Any dietary requirements I should note?",
    },
    { speaker: "customer", delay: 1600, text: "No nuts, please." },
    {
      speaker: "agent",
      delay: 1400,
      text: "Noted, nut-free. Would you prefer pickup or delivery?",
    },
    { speaker: "customer", delay: 1500, text: "Delivery would be great." },
    {
      speaker: "agent",
      delay: 1400,
      text: "And do you have a budget range in mind?",
    },
    { speaker: "customer", delay: 1600, text: "Somewhere between $150 and $200." },
    {
      speaker: "agent",
      delay: 1600,
      text: "Perfect. When is a good time for the bakery to call you back with a quote?",
    },
    { speaker: "customer", delay: 1700, text: "Today after 3 PM works for me." },
    {
      speaker: "agent",
      delay: 2400,
      text: "Let me confirm: a two-tier chocolate cake for about 30 guests, pink princess theme with the name Lily, nut-free, delivered on August 15th, budget $150–$200, callback today after 3 PM. Is that all correct?",
    },
    { speaker: "customer", delay: 1600, text: "Yes, that's exactly right!" },
    {
      speaker: "agent",
      delay: 1800,
      text: `Perfect. ${bakeryName} will call you back today after 3 PM with a quote. Thanks so much, ${firstName} — have a great day!`,
    },
  ];
}

export const DEMO_ORDER: CakeOrder = {
  eventType: "Birthday",
  eventDate: "August 15",
  guests: 30,
  size: "Two-tier",
  flavor: "Chocolate",
  design: "Pink princess theme, name \"Lily\"",
  dietary: "Nut-free",
  fulfillment: "Delivery",
  budget: "$150–$200",
  callbackTime: "Today after 3 PM",
};

const EXTRA_LEADS = [
  { name: "Marcus Lee", phone: "(555) 201-8834" },
  { name: "Priya Patel", phone: "(555) 448-2210" },
  { name: "Emily Torres", phone: "(555) 774-9031" },
  { name: "David Kim", phone: "(555) 315-6642" },
];

export function makeDemoLead(index: number): Omit<Lead, "id" | "createdAt"> {
  const base =
    index === 0
      ? { name: "Sarah Johnson", phone: "(555) 867-5309" }
      : EXTRA_LEADS[(index - 1) % EXTRA_LEADS.length];
  return {
    ...base,
    source: "Meta lead ad",
    status: "new",
    transcript: [],
    callOutcome: null,
    order: null,
    nextAction: null,
  };
}

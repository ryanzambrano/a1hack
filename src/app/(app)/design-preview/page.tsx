"use client";

import {
  IconArrowRight,
  IconCheck,
  IconPhone,
  IconPlus,
  IconRefresh,
} from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Chip,
  DataRow,
  EmptyState,
  Field,
  Input,
  Metric,
  Mono,
  Note,
  SectionLabel,
  Skeleton,
  StatusDot,
} from "@/components/ui";

/**
 * Living style guide for the Geist primitives in @/components/ui.
 * Not linked from the rail — visit /design-preview directly.
 */
export default function DesignPreview() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <SectionLabel>Buttons</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="error">Error</Button>
        <Button variant="warning">Warning</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button loading>Loading</Button>
        <Button prefix={<IconPlus />}>With icon</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary">
          Small
        </Button>
        <Button size="md" variant="primary">
          Medium
        </Button>
        <Button size="lg" variant="primary" prefix={<IconArrowRight />}>
          Large
        </Button>
      </div>

      <SectionLabel>Badges</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Badge dot>Gray</Badge>
        <Badge tone="blue" dot pulse>
          Calling
        </Badge>
        <Badge tone="green" dot>
          Booked
        </Badge>
        <Badge tone="amber" dot>
          New
        </Badge>
        <Badge tone="red" dot>
          Failed
        </Badge>
        <Badge tone="purple" dot>
          Follow up
        </Badge>
        <Mono>lead_8f2a10</Mono>
        <StatusDot tone="green" pulse />
      </div>

      <SectionLabel>Notes</SectionLabel>
      <div className="grid gap-2">
        <Note>Neutral note on a surface.</Note>
        <Note tone="blue" title="Inbound agent line">
          +1 512 555 0148 — call it from any phone.
        </Note>
        <Note tone="green">Campaign launched successfully.</Note>
        <Note tone="amber">Budget is below the recommended floor.</Note>
        <Note tone="red" title="Call failed">
          Retell returned HTTP 402.
        </Note>
      </div>

      <SectionLabel>Form</SectionLabel>
      <Card>
        <CardHeader
          title="Identity"
          description="Shown in the ad unit and spoken on every call."
          actions={<Badge tone="green">Saved</Badge>}
        />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Bakery name">
            <Input placeholder="Sweet Street Bakery" />
          </Field>
          <Field label="Phone" hint="Quoted when a caller asks.">
            <Input placeholder="+15125550148" className="font-mono tnum" />
          </Field>
          <div className="sm:col-span-2">
            <SectionLabel>Cake types</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip selected>
                <IconCheck className="size-3" />
                Birthday
              </Chip>
              <Chip>Wedding</Chip>
              <Chip selected>
                <IconCheck className="size-3" />
                Cupcakes
              </Chip>
            </div>
          </div>
        </div>
        <CardFooter>
          <p className="text-xs text-gray-700">Saving regenerates creative.</p>
          <Button variant="primary" prefix={<IconRefresh />}>
            Save
          </Button>
        </CardFooter>
      </Card>

      <SectionLabel>Data</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Order record" actions={<Badge tone="green" dot>Booked</Badge>} />
          <div className="px-5 py-3">
            <DataRow label="Occasion" value="Birthday" />
            <DataRow label="Date" value="2026-08-14" mono />
            <DataRow label="Servings" value="24" mono />
            <DataRow label="Budget" value="$180" mono />
            <DataRow label="Fulfillment" value="Delivery" />
          </div>
          <div className="border-t border-gray-200 p-3">
            <Button variant="primary" prefix={<IconPhone />} className="w-full">
              Call Dana
            </Button>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card>
            <div className="grid grid-cols-2 gap-6 px-5 py-4">
              <Metric label="Daily budget" value="$10" unit="/ day" caption="$300/month" />
              <Metric label="Leads" value="47" caption="12 qualified" />
            </div>
          </Card>
          <Card className="p-5">
            <SectionLabel>Loading</SectionLabel>
            <div className="mt-3 grid gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-9 w-28" />
            </div>
          </Card>
        </div>
      </div>

      <SectionLabel>Empty</SectionLabel>
      <EmptyState
        title="No leads yet"
        description="Leads from your ad's form land here automatically."
        action={<Button prefix={<IconPlus />}>Simulate lead</Button>}
      />
    </div>
  );
}

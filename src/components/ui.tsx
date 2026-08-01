/**
 * Geist primitives.
 *
 * Sizes, radii, weights and easing are transcribed from the computed styles of
 * the real components on vercel.com (see docs/design/vercel-components.json).
 * The load-bearing details: 6px radius, 14px/500 labels, 32/36/40px heights,
 * inset-ring borders instead of real ones, and a 150ms cubic-bezier easing.
 */

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "tertiary" | "error" | "warning";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,box-shadow,color,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] " +
  "disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Near-black fill, warm-white label — the highest-contrast action there is.
  primary: "bg-solid text-on-solid hover:bg-solid-hover",
  // No real border: an inset ring, so hover can thicken it without reflow.
  secondary:
    "bg-surface text-gray-1000 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] hover:bg-gray-100 hover:shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-500)]",
  tertiary: "bg-transparent text-gray-900 hover:bg-alpha-200 hover:text-gray-1000",
  error: "bg-red-800 text-white hover:bg-red-700",
  // Amber is far too light to carry white text; it takes the dark label.
  warning: "bg-amber-800 text-gray-1000 hover:bg-amber-700",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-1.5 text-sm",
  md: "h-9 px-2.5 text-sm",
  lg: "h-10 rounded-lg px-3.5 text-base",
};

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  prefix?: ReactNode;
} & Omit<ComponentProps<"button">, "prefix">;

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  prefix,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    >
      {loading ? <Spinner /> : prefix}
      {children}
    </button>
  );
}

/** Same pixels as Button, rendered as a Next link. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  prefix,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  prefix?: ReactNode;
} & Omit<ComponentProps<typeof Link>, "prefix">) {
  return (
    <Link
      {...rest}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    >
      {prefix}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cx(
        "rounded-xl border border-gray-200 bg-surface shadow-small",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card header — title left, actions right, hairline underneath. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium text-gray-1000">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-gray-900">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The muted strip Vercel puts at the bottom of a card for secondary actions. */
export function CardFooter({ className, children }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-gray-200 bg-background/60 px-5 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge / status                                                              */
/* -------------------------------------------------------------------------- */

export type BadgeTone = "gray" | "blue" | "green" | "amber" | "red" | "purple";

const BADGE_TONES: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-900 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]",
  blue: "bg-blue-100 text-blue-900 shadow-[inset_0_0_0_1px_var(--ds-blue-300)]",
  green: "bg-green-100 text-green-900 shadow-[inset_0_0_0_1px_var(--ds-green-300)]",
  amber: "bg-amber-100 text-amber-900 shadow-[inset_0_0_0_1px_var(--ds-amber-300)]",
  red: "bg-red-100 text-red-900 shadow-[inset_0_0_0_1px_var(--ds-red-300)]",
  purple: "bg-purple-100 text-purple-900 shadow-[inset_0_0_0_1px_var(--ds-purple-300)]",
};

const DOT_TONES: Record<BadgeTone, string> = {
  gray: "text-gray-600",
  blue: "text-blue-900",
  green: "text-green-900",
  amber: "text-amber-900",
  red: "text-red-900",
  purple: "text-purple-900",
};

export function Badge({
  tone = "gray",
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {children}
    </span>
  );
}

export function StatusDot({
  tone = "gray",
  pulse = false,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "size-1.5 shrink-0 rounded-full bg-current",
        DOT_TONES[tone],
        pulse && "animate-ping-ring",
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

const CONTROL =
  "w-full rounded-md bg-background px-3 text-sm text-gray-1000 placeholder:text-gray-700 " +
  "shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] transition-shadow duration-150 " +
  "hover:shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-500)] disabled:opacity-40";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input {...rest} className={cx(CONTROL, "h-9", className)} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea {...rest} className={cx(CONTROL, "py-2", className)} />;
}

/** Label + control + optional hint, stacked on the 4px grid. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("grid gap-1.5", className)}>
      <span className="text-sm font-medium text-gray-1000">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-900">{hint}</span>}
    </label>
  );
}

/** Multi-select chip. Selected state borrows the primary button's inversion. */
export function Chip({
  selected,
  className,
  children,
  ...rest
}: { selected?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-all duration-150",
        selected
          ? "bg-solid text-on-solid"
          : "bg-surface text-gray-900 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] hover:text-gray-1000 hover:shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-500)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Console density                                                             */
/* -------------------------------------------------------------------------- */

/** Section title above a data group. Mono, uppercase, tracked out. */
export function SectionLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <p className={cx("label-micro", className)}>{children}</p>;
}

/** Key/value row with a dotted leader — dense, scannable, no table needed. */
export function DataRow({
  label,
  value,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 text-sm">
      <span className="shrink-0 text-gray-900">{label}</span>
      <span className="min-w-3 flex-1 translate-y-[-3px] border-b border-dotted border-gray-500" />
      <span
        className={cx(
          "min-w-0 text-right font-medium text-gray-1000",
          mono && "font-mono text-[13px] tnum",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Big single number with its unit and caption. */
export function Metric({
  label,
  value,
  unit,
  caption,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-2 text-2xl font-medium tracking-tight text-gray-1000 tnum">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-gray-700">{unit}</span>}
      </p>
      {caption && <p className="mt-1 text-xs text-gray-900">{caption}</p>}
    </div>
  );
}

/** Geist's Note — a bordered callout, tinted by severity. */
export function Note({
  tone = "gray",
  title,
  className,
  children,
}: {
  tone?: BadgeTone;
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    gray: "border-gray-200 bg-surface text-gray-900",
    blue: "border-blue-300 bg-blue-100 text-blue-1000",
    green: "border-green-300 bg-green-100 text-green-1000",
    amber: "border-amber-300 bg-amber-100 text-amber-1000",
    red: "border-red-300 bg-red-100 text-red-1000",
    purple: "border-purple-300 bg-purple-100 text-purple-1000",
  };
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="mb-0.5 font-medium">{title}</p>}
      {children}
    </div>
  );
}

/** Dashed placeholder for a zero state. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 px-6 py-16 text-center",
        className,
      )}
    >
      <p className="text-[15px] font-medium text-gray-1000">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-gray-900">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Inline monospace identifier — deploy hashes, phone numbers, lead ids. */
export function Mono({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "rounded bg-alpha-100 px-1.5 py-0.5 font-mono text-[12px] text-gray-900 tnum",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("shimmer rounded-md", className)} />;
}

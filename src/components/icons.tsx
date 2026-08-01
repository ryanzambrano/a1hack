/**
 * 16px stroke icons, drawn on the same grid and weight as Geist's icon set:
 * 1.5px strokes, round caps, no fills. Inline so there's no icon dependency.
 */

import type { SVGProps } from "react";

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
  </Icon>
);

export const IconMegaphone = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 6.5v3a1 1 0 0 0 1 1h1.5L9 13.5V2.5L4.5 5.5H3a1 1 0 0 0-1 1Z" />
    <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5" />
  </Icon>
);

export const IconPipeline = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="1.75" y="2.25" width="3.5" height="11.5" rx="1" />
    <rect x="6.25" y="2.25" width="3.5" height="7.5" rx="1" />
    <rect x="10.75" y="2.25" width="3.5" height="9.5" rx="1" />
  </Icon>
);

export const IconPhone = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5.2 2.3 6.4 5 5.1 6.3a7.5 7.5 0 0 0 3.6 3.6L10 8.6l2.7 1.2v2.4a1 1 0 0 1-1.1 1A11 11 0 0 1 2.3 4.4a1 1 0 0 1 1-1.1h1.9Z" />
  </Icon>
);

export const IconActivity = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M1.5 8h3l2-5 3 10 2-5h3" />
  </Icon>
);

export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </Icon>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.7-4" />
    <path d="M13.8 1.8v2.6h-2.6" />
  </Icon>
);

export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6" />
    <path d="M10.5 11 13.5 8l-3-3M13.5 8H6" />
  </Icon>
);

export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2.5 4h11M6 4V2.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75V4" />
    <path d="M4 4v8.25a1.25 1.25 0 0 0 1.25 1.25h5.5A1.25 1.25 0 0 0 12 12.25V4" />
  </Icon>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 8.5 6.25 12 13 4.5" />
  </Icon>
);

export const IconMic = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="6" y="1.75" width="4" height="7.5" rx="2" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25" />
  </Icon>
);

/** The product mark: a two-tier cake with a cherry, drawn as one solid
 *  silhouette so it stays legible at 12px in the rail. */
export const IconMark = (p: SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden {...p}>
    <circle cx="8" cy="1.85" r="1.35" />
    <rect x="7.35" y="3.3" width="1.3" height="2.4" rx="0.5" />
    <path d="M4.75 5.5h6.5a1.25 1.25 0 0 1 1.25 1.25V9.5h-9V6.75A1.25 1.25 0 0 1 4.75 5.5Z" />
    <path d="M2 10.5h12a1.25 1.25 0 0 1 1.25 1.25v1.5A1.25 1.25 0 0 1 14 14.5H2a1.25 1.25 0 0 1-1.25-1.25v-1.5A1.25 1.25 0 0 1 2 10.5Z" />
  </svg>
);

/** Wordmark lockup: the cake plus the name, in the display serif. */
export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <IconMark className={markClassName ?? "text-honey"} />
      <span className="font-display font-semibold">SweetLeads</span>
    </span>
  );
}

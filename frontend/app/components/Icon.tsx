import type { SVGProps } from "react";

// Small inline icon set (24px grid, stroke-based). Decorative unless given a title.
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z",
  x: "M6 6l12 12M18 6L6 18",
  info: "M12 11v5m0-8.5v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  upload: "M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16",
  arrowRight: "M5 12h14m-5.5-5.5L19 12l-5.5 5.5",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z",
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5zm0 0v5h5",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0",
  scale: "M12 4v16m-7 0h14M6 8l-3 6a3 3 0 006 0L6 8zm12 0l-3 6a3 3 0 006 0l-3-6zM6 8h12",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8l2.8 2.8m0-11.4l-2.8 2.8m-5.8 5.8l-2.8 2.8",
  clipboard: "M9 4h6m-6 0a1 1 0 00-1 1v1h8V5a1 1 0 00-1-1M9 4H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2m-6 9l2 2 4-4",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 6c0 1.7 3.6 3 8 3s8-1.3 8-3",
  code: "M8 8l-4 4 4 4m8-8l4 4-4 4m-5.5 2l3-12",
  book: "M4 5a2 2 0 012-2h13v15H6a2 2 0 00-2 2V5zm0 15a2 2 0 002 2h13",
  pen: "M4 20h4L19 9l-4-4L4 16v4zm9-13l4 4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, title, ...props }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...props}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden className={`motion-safe:animate-spin ${className ?? ""}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

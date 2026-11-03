import type { SVGProps } from "react";

// KYCite monogram: a shield with a K, and a teal check badge for "every check
// cites its source". Same drawing as app/icon.svg (the favicon). Decorative.
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden focusable="false" {...props}>
      <path d="M16 2 28 6.5v9c0 7-5.1 12.1-12 14.5C9.1 27.6 4 22.5 4 15.5v-9Z" fill="#4f46e5" />
      <path d="M16 2 28 6.5v9c0 7-5.1 12.1-12 14.5Z" fill="#4338ca" />
      <path d="M12 9.5v12M20 9.5l-7.4 6.1 7.9 5.9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="24.5" r="5.2" fill="#14b8a6" stroke="#0a1128" strokeWidth="1.5" />
      <path d="m22.3 24.6 1.6 1.6 2.9-3.1" fill="none" stroke="#0a1128" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

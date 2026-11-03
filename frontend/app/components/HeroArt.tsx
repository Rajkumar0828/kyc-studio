// Decorative hero illustration (inline SVG, no external assets): an abstract
// document whose highlighted line is boxed in teal and linked to a rule chip,
// the "every check cites its source" idea. Not a real document; aria-hidden.
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 340" className={className} aria-hidden focusable="false">
      {/* soft backdrop */}
      <ellipse cx="230" cy="180" rx="190" ry="150" className="fill-accent-500/10" />
      <ellipse cx="300" cy="110" rx="110" ry="80" className="fill-brand-400/10" />

      {/* back sheet */}
      <rect x="92" y="58" width="190" height="236" rx="16" className="fill-white stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-700" strokeWidth="1.5" transform="rotate(-6 187 176)" />
      {/* front document */}
      <g>
        <rect x="118" y="44" width="200" height="252" rx="16" className="fill-white stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-700" strokeWidth="1.5" />
        <rect x="138" y="66" width="64" height="10" rx="5" className="fill-accent-600/80 dark:fill-accent-400/80" />
        <rect x="138" y="86" width="140" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        {/* abstract avatar block: geometric, not a photo */}
        <rect x="138" y="108" width="52" height="60" rx="10" className="fill-zinc-100 dark:fill-zinc-800" />
        <circle cx="164" cy="128" r="10" className="fill-zinc-300 dark:fill-zinc-600" />
        <path d="M147 160c4-11 30-11 34 0" className="fill-zinc-300 dark:fill-zinc-600" />
        <rect x="202" y="112" width="96" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="202" y="128" width="76" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="202" y="144" width="88" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        {/* the cited line, with its grounding box */}
        <rect x="138" y="190" width="120" height="7" rx="3.5" className="fill-zinc-300 dark:fill-zinc-600" />
        <rect x="131" y="182" width="134" height="23" rx="6" className="fill-brand-400/15 stroke-brand-500" strokeWidth="2" strokeDasharray="5 4" />
        <rect x="138" y="218" width="150" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="138" y="234" width="110" height="6" rx="3" className="fill-zinc-200 dark:fill-zinc-700" />
        <rect x="138" y="262" width="70" height="14" rx="7" className="fill-zinc-100 dark:fill-zinc-800" />
      </g>

      {/* connector to the rule chip */}
      <path d="M265 193 C 300 193, 310 232, 338 232" fill="none" className="stroke-brand-500" strokeWidth="2" />
      <circle cx="265" cy="193" r="3.5" className="fill-brand-500" />
      <g>
        <rect x="300" y="214" width="112" height="38" rx="12" className="fill-white stroke-brand-500 dark:fill-zinc-900" strokeWidth="1.5" />
        <circle cx="320" cy="233" r="8" className="fill-brand-500" />
        <path d="m316 233 3 3 5-5.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="334" y="226" width="64" height="5" rx="2.5" className="fill-zinc-300 dark:fill-zinc-600" />
        <rect x="334" y="236" width="44" height="5" rx="2.5" className="fill-zinc-200 dark:fill-zinc-700" />
      </g>

      {/* shield */}
      <g transform="translate(40 196)">
        <path d="M36 0 70 12v26c0 20-14.5 34.5-34 41C16.5 72.5 2 58 2 38V12Z" className="fill-accent-600 dark:fill-accent-500" />
        <path d="m22 39 10 10 18-20" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* ledger ticks */}
      <g className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.5" strokeLinecap="round">
        <path d="M330 72h44M330 84h30M330 96h38" />
      </g>
    </svg>
  );
}

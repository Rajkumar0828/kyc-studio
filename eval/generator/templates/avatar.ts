import type { Avatar } from "../people";

// Flat illustrated avatar (simple shapes). Never a photo or a realistic face.
export function avatarSvg(a: Avatar, width: number, height: number) {
  const hair = {
    short: `<path d="M118 190 Q120 92 200 88 Q282 92 284 190 Q262 132 200 130 Q140 132 118 190Z" fill="${a.hair}"/>`,
    long: `<path d="M104 330 Q86 96 200 86 Q314 96 296 330 L268 330 Q276 170 200 132 Q124 170 132 330Z" fill="${a.hair}"/>`,
    bun: `<circle cx="200" cy="70" r="40" fill="${a.hair}"/><path d="M118 186 Q122 96 200 92 Q278 96 282 186 Q258 128 200 126 Q142 128 118 186Z" fill="${a.hair}"/>`,
  }[a.hairStyle];
  return `<svg width="${width}" height="${height}" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="500" fill="${a.bg}"/>
  <path d="M40 500 Q48 372 200 356 Q352 372 360 500Z" fill="${a.shirt}"/>
  <rect x="172" y="290" width="56" height="78" rx="20" fill="${a.skin}"/>
  <ellipse cx="200" cy="208" rx="86" ry="104" fill="${a.skin}"/>
  <ellipse cx="114" cy="214" rx="13" ry="22" fill="${a.skin}"/>
  <ellipse cx="286" cy="214" rx="13" ry="22" fill="${a.skin}"/>
  ${hair}
  <circle cx="168" cy="212" r="7" fill="#2a2a2a"/>
  <circle cx="232" cy="212" r="7" fill="#2a2a2a"/>
  <path d="M176 262 Q200 280 224 262" fill="none" stroke="#7a3b2e" stroke-width="5" stroke-linecap="round"/>
</svg>`;
}

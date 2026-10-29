import type { Avatar } from "../people";
import { avatarSvg } from "./avatar";
import { page } from "./common";

export const SELFIE_SIZE = { width: 1080, height: 1350 };

// The policies require a selfie, so each case gets an illustrated stand-in.
const css = `
  .selfie { background: #f4f1ea; }
  .selfie .wm { font-size: 200px; z-index: 3; } /* no text fields here, so the mark sits on top */
  .selfie .stamp { left: 40px; top: 40px; font-size: 40px; }
  .selfie .cap { position: absolute; left: 0; right: 0; bottom: 0; height: 130px; background: #22313f; color: #fff;
                 display: flex; align-items: center; justify-content: center; font-size: 32px; letter-spacing: 0.06em; }
`;

export function selfieHtml(a: Avatar) {
  const { width, height } = SELFIE_SIZE;
  const body = `<div class="doc selfie">
  <div class="layer">${avatarSvg(a, width, height - 130)}</div>
  <div class="wm">SPECIMEN</div>
  <div class="stamp">SPECIMEN</div>
  <div class="cap layer">Synthetic selfie illustration · not a real person</div>
</div>`;
  return page(width, height, css, body);
}

import type { IdCardData } from "../cases";
import { formatAddress } from "../people";
import { avatarSvg } from "./avatar";
import { dateShort, field, page, waves } from "./common";

export const ID_SIZE = { width: 1712, height: 1080 }; // ID-1 card ratio, short side 1080

// Issuer: the invented "Republic of Veridia". Crest, colours and layout are made up
// for this project and are not based on any real government document.
const crest = `<svg width="132" height="132" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="46" fill="#f3efe2" stroke="#1f5a4a" stroke-width="5"/>
  <path d="M50 80 C50 60 50 40 50 22" stroke="#1f5a4a" stroke-width="4" fill="none"/>
  <path d="M50 52 C38 50 30 40 30 30 C42 32 50 40 50 52Z" fill="#3b8a6e"/>
  <path d="M50 44 C62 42 70 32 70 22 C58 24 50 32 50 44Z" fill="#3b8a6e"/>
  <path d="M50 66 C40 64 33 56 33 48 C43 50 50 56 50 66Z" fill="#3b8a6e"/>
</svg>`;

const css = `
  .id { background: linear-gradient(135deg, #eef4f0 0%, #e3ece8 55%, #efe9dc 100%); }
  .id header { position: absolute; left: 0; top: 0; right: 0; height: 190px; background: #1f5a4a; color: #fff;
               display: flex; align-items: center; gap: 30px; padding: 0 56px; }
  .id header h1 { font-size: 50px; letter-spacing: 0.08em; font-weight: 700; }
  .id header h2 { font-size: 30px; font-weight: 400; opacity: 0.9; letter-spacing: 0.05em; }
  .id .photo { position: absolute; left: 64px; top: 250px; width: 440px; height: 550px; border: 6px solid #fff;
               box-shadow: 0 2px 10px rgba(0,0,0,0.18); }
  .id .fields { position: absolute; left: 570px; top: 245px; right: 60px; display: grid;
                grid-template-columns: 1fr 1fr; column-gap: 40px; row-gap: 34px; }
  .id .full { grid-column: 1 / 3; }
  .id label { display: block; font-size: 24px; text-transform: uppercase; letter-spacing: 0.1em; color: #4c6a60; margin-bottom: 4px; }
  .id .fv { font-size: 44px; font-weight: 600; color: #121820; }
  .id .num { font-family: Consolas, "Courier New", monospace; letter-spacing: 0.06em; }
  .id .addr { font-size: 36px; font-weight: 500; }
  .id .wm { font-size: 250px; }
  .id .stamp { right: 60px; top: 228px; font-size: 40px; }
  .id footer { position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: #d9e5df;
               display: flex; align-items: center; justify-content: space-between; padding: 0 64px;
               font-size: 24px; color: #2f4a41; }
`;

export function idCardHtml(d: IdCardData) {
  const { width, height } = ID_SIZE;
  const body = `<div class="doc id">
  ${waves(width, height, "rgba(31, 90, 74, 0.10)")}
  <div class="wm">SPECIMEN</div>
  <header class="layer">${crest}<div><h1>REPUBLIC OF VERIDIA</h1><h2>National Identity Card · Fictional</h2></div></header>
  <div class="photo layer">${avatarSvg(d.avatar, 428, 538)}</div>
  <div class="fields layer">
    <div class="full"><label>Full name</label>${field("full_name", d.fullName.toUpperCase(), d.fullName)}</div>
    <div><label>Date of birth</label>${field("date_of_birth", dateShort(d.dateOfBirth), d.dateOfBirth)}</div>
    <div><label>Document no.</label><span class="num">${field("document_number", d.idNumber)}</span></div>
    <div><label>Date of issue</label>${field("issue_date", dateShort(d.issueDate), d.issueDate)}</div>
    <div><label>Date of expiry</label>${field("expiry_date", dateShort(d.expiryDate), d.expiryDate)}</div>
    <div class="full addr"><label>Address</label>${field("address", formatAddress(d.address))}</div>
  </div>
  <div class="stamp">SPECIMEN</div>
  <footer class="layer"><span>Veridia Civil Registry (fictional issuer)</span><span>Synthetic test document · not valid for identification</span></footer>
</div>`;
  return page(width, height, css, body);
}

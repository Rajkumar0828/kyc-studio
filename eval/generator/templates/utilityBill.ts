import type { BillData } from "../cases";
import { formatAddress } from "../people";
import { dateLong, dateShort, esc, field, money, page } from "./common";

export const BILL_SIZE = { width: 1240, height: 1754 }; // A4 portrait at 150 dpi

// Issuer: the invented "Quillmere Water & Power". No phone numbers; the only
// contact is a reserved .invalid domain.
const logo = `<svg width="84" height="84" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 8 C70 36 82 52 82 66 A32 32 0 0 1 18 66 C18 52 30 36 50 8Z" fill="#2b7bb9"/>
  <path d="M54 40 L40 66 L52 66 L46 88 L64 58 L52 58Z" fill="#ffd34d"/>
</svg>`;

const css = `
  .bill { background: #fff; padding: 70px 80px; }
  .bill header { display: flex; align-items: center; gap: 22px; border-bottom: 4px solid #2b7bb9; padding-bottom: 26px; }
  .bill header h1 { font-size: 40px; color: #184a72; }
  .bill header p { font-size: 20px; color: #5b6b7a; }
  .bill .stamp { right: 80px; top: 74px; font-size: 32px; }
  .bill .top { display: flex; justify-content: space-between; margin-top: 60px; }
  .bill .to { width: 520px; font-size: 28px; line-height: 1.5; }
  .bill .to .fv { font-size: 30px; }
  .bill .to .name { font-weight: 600; }
  .bill .muted { color: #5b6b7a; font-size: 20px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
  .bill .summary { width: 530px; border: 2px solid #cfdbe6; border-radius: 10px; padding: 26px 30px; font-size: 24px; }
  .bill .summary div { display: flex; justify-content: space-between; gap: 20px; padding: 8px 0; white-space: nowrap; }
  .bill .summary .fv { font-weight: 600; }
  .bill .summary .due { border-top: 2px solid #cfdbe6; margin-top: 10px; padding-top: 16px; font-size: 30px; font-weight: 700; color: #184a72; }
  .bill h3 { margin-top: 70px; font-size: 28px; color: #184a72; }
  .bill table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 24px; }
  .bill th { text-align: left; background: #eef4fa; padding: 14px 12px; font-weight: 600; color: #34495e; }
  .bill td { padding: 14px 12px; border-bottom: 1px solid #e3e9ef; }
  .bill td.r, .bill th.r { text-align: right; }
  .bill .total td { font-weight: 700; border-bottom: none; font-size: 28px; }
  .bill .note { margin-top: 70px; font-size: 22px; line-height: 1.6; color: #45525f; }
  .bill footer { position: absolute; left: 80px; right: 80px; bottom: 60px; border-top: 2px solid #e3e9ef; padding-top: 20px;
                 font-size: 19px; color: #6b7785; line-height: 1.6; }
  .bill .wm { font-size: 230px; }
`;

export function utilityBillHtml(d: BillData) {
  const { width, height } = BILL_SIZE;
  const wUse = d.water.current - d.water.previous, pUse = d.power.current - d.power.previous;
  const wCost = wUse * d.water.rate, pCost = pUse * d.power.rate, total = wCost + pCost + d.serviceCharge;
  const body = `<div class="doc bill">
  <div class="wm">SPECIMEN</div>
  <header class="layer">${logo}<div><h1>Quillmere Water &amp; Power</h1><p>Community utility co-operative · fictional company</p></div></header>
  <div class="stamp">SPECIMEN</div>
  <div class="top layer">
    <div class="to">
      <div class="muted">Account holder &amp; service address</div>
      <div class="name">${field("full_name", d.fullName)}</div>
      <div>${field("address", formatAddress(d.address))}</div>
    </div>
    <div class="summary">
      <div><span>Account number</span>${field("document_number", d.accountNumber)}</div>
      <div><span>Bill date</span>${field("issue_date", dateLong(d.billDate), d.billDate)}</div>
      <div><span>Billing period</span><span>${esc(dateShort(d.periodStart))} – ${esc(dateShort(d.periodEnd))}</span></div>
      <div><span>Payment due</span><span>${esc(dateLong(d.dueDate))}</span></div>
      <div class="due"><span>Amount due</span><span>${money(total)}</span></div>
    </div>
  </div>
  <h3 class="layer">Your usage this period</h3>
  <table class="layer">
    <tr><th>Service</th><th class="r">Previous</th><th class="r">Current</th><th class="r">Used</th><th class="r">Rate</th><th class="r">Charge</th></tr>
    <tr><td>Water (m³)</td><td class="r">${d.water.previous}</td><td class="r">${d.water.current}</td><td class="r">${wUse}</td><td class="r">${money(d.water.rate)}</td><td class="r">${money(wCost)}</td></tr>
    <tr><td>Electricity (kWh)</td><td class="r">${d.power.previous}</td><td class="r">${d.power.current}</td><td class="r">${pUse}</td><td class="r">${money(d.power.rate)}</td><td class="r">${money(pCost)}</td></tr>
    <tr><td>Service charge</td><td></td><td></td><td></td><td></td><td class="r">${money(d.serviceCharge)}</td></tr>
    <tr class="total"><td>Total</td><td></td><td></td><td></td><td></td><td class="r">${money(total)}</td></tr>
  </table>
  <p class="note layer">Thank you for being a member of the co-operative. Pay online at quillmere-utility.invalid
  using your account number as the reference. Meter readings are estimated where marked.</p>
  <footer class="layer">This is a fictional specimen bill produced for software testing. Quillmere Water &amp; Power,
  its customers and its addresses do not exist. Amounts are in invented currency (V$).</footer>
</div>`;
  return page(width, height, css, body);
}

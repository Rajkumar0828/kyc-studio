# Specimen generator

Renders **fictional** KYC test documents, with ground truth, into `eval/specimens/<case-id>/`.

Everything here is invented: the people, the "Republic of Veridia" ID card, the
"Quillmere Water & Power" bill, the street and city names, and the ID-number
pattern (`VD` + 8 characters, not based on any real scheme). There are no phone
numbers, only a `.invalid` domain. Every image carries a SPECIMEN watermark
and stamp. Photos are flat SVG illustrations, not faces.

## Regenerate

```
npm install --prefix eval/generator           # once
npm run generate --prefix eval/generator      # from the repo root
```

(or `npm run specimens` from `frontend/`). This deletes and rebuilds everything
under `eval/specimens/`, and only there: the cleanup refuses any path outside it.

Requirements:
- Microsoft Edge (rendering uses Playwright with `channel: "msedge"`, so there's no browser download).
- `frontend/node_modules` installed. The generator imports the app's registry
  and sharpness check to verify its output.

The output is deterministic. Dates are fixed, details come from a seeded RNG
(`SEED` in `cases.ts`), and only system fonts are used.

## Output per case

| File | Contents |
|---|---|
| `id.png` | National ID, 1712×1080 |
| `bill.png` | Utility bill, 1240×1754 |
| `selfie.png` | Illustrated selfie, 1080×1350 (the policies require one) |
| `id.truth.json`, `bill.truth.json` | Each field's `found`, `value` (exactly as printed), `normalized` (ISO dates), and `box` as `[x_min, y_min, x_max, y_max]` on a 0–1000 grid. Fields a document doesn't have are `found: false`, `box: [0,0,0,0]`. On the bill, `document_number` is the account number and `issue_date` is the bill date. |
| `case.json` | `as_of` (the pipeline's "today"), `policy_id`, `defects`, and `expected`: the pipeline `decision` plus the `flag_categories` and `flag_codes` it must raise (a minimum set). |

Boxes are measured by the browser from the printed text, not estimated.

## Cases

Defined in `cases.ts`:

- `CASE_SPECS`: explicit `{ person, defects }` rows.
- `SAMPLED`: extra seeded random combinations.
- People and the alternate names and addresses that defects draw from are in `people.ts`.

To grow the set to about 40 cases, add a person (and their ID record and address to
`frontend/src/lib/authority/registry.ts`; the generator fails if you forget),
then raise `SAMPLED.count`.

| Defect | Changes | Expected flag |
|---|---|---|
| `expired` | ID expiry 20–400 days before `as_of` | `document_expired` (customer_fixable) |
| `name-mismatch` | Bill holder has a different first name | `full_name_mismatch` (integrity) |
| `address-mismatch` | Bill address is another registry address | `address_mismatch` (integrity) |
| `blurry` | ID rendered with a 5px CSS blur | `quality_failed` (customer_fixable); the pipeline stops at the quality gate |

The decision follows the pipeline's precedence: any integrity flag leads to
`manual_review`, otherwise any customer-fixable flag leads to `request_info`,
otherwise `auto_approve`.

## Sharpness threshold

The quality gate's `MIN_SHARPNESS = 100` (variance of the Laplacian on a grayscale
copy scaled to 1000 px) was calibrated on this set:

- sharp documents and selfies scored roughly 300–2000;
- the 5px-blurred ID scored about 3.

Each run prints these scores and fails if the gate would disagree with a case's design.
Real phone photos are softer than rendered pages, so re-check the threshold
on real-world samples before relying on it.

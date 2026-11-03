# Measured eval reports

Copies of two reports produced by `npm run eval:meta` (frontend/scripts/eval-meta)
against Meta's `muse-spark-1.3`. Each is the unedited `report.md` from
`eval/reports/<run>/`. All inputs are the 10 synthetic specimen documents in
`eval/specimens` (6 cases, an ID card and a utility bill each): fictional
people, generated images, no real documents.

| File | Source run | What it measures |
|---|---|---|
| [2026-11-02-full-eval-effort-low.md](2026-11-02-full-eval-effort-low.md) | `eval/reports/2026-11-02T04-31-53-701Z` | The full pipeline (classification, extraction, rules, decisions) with every step at reasoning effort low |
| [2026-11-01-extract-only-repeatability.md](2026-11-01-extract-only-repeatability.md) | `eval/reports/2026-11-01T08-59-17-410Z-extract` | Extraction only, 3 repeats at effort medium and at effort low, used to choose the extraction effort |

The per-document headings link to overlay pages (`overlays/*.html`) that draw
model and truth boxes on each image. Those pages are not copied here; they stay
next to the original reports in `eval/reports/`, which is not committed.

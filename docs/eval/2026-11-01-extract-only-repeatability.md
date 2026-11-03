# Meta extraction repeatability report

Run 2026-11-01T08:59:17.410Z → 2026-11-01T09:09:53.178Z · model `muse-spark-1.3`

## Rules and settings

- **Box rule:** A box passes when the centre of the model's box lies inside the truth box AND IoU >= 0.4. Truth boxes include the text's line padding while model boxes tend to be tight, so IoU alone under-scores; it is still reported for every box.
- **Box diagnostics (failed boxes only):** centre offset dx / dy of the model box from the truth box, in percent of the 0-1000 grid (positive = right / down), and size ratio width / height (model ÷ truth).
- **Overlays:** each document heading links to a page with model boxes in red and truth boxes in green.
- **Value rule:** Values are compared with truth.normalized, case-insensitive, with whitespace collapsed. Dates are first parsed to YYYY-MM-DD (e.g. "09 MAY 2031", "9 May 2031", "May 9, 2031", "2031-05-09"); whether the model returned the requested YYYY-MM-DD format is reported separately.
- **Mode:** --extract-only, 3 repeats, efforts medium, low. The repeat index is part of the cache key (never sent to Meta).
- **Reasoning effort used:** doc_class=low, extraction=medium,low, compare=low, summary=low, guidance=low
- **max_completion_tokens:** doc_class=2000, extraction=4000, compare=2000, summary=2000, guidance=2000. A finish_reason of `length` is reported as its own failure type.
- **Prices (USD per 1M tokens):** input 1.25, cached input 0.15, output incl. reasoning 4.25 (https://dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-30).
- **Call cap:** 80 live calls. Cached responses do not count toward the cap or the token totals.
- **Cache:** on (eval\.cache\meta)
- **Token counting:** 13 live count requests, 8 served from cache. Meta's token-counting docs (https://dev.meta.ai/docs/token-counting, checked 2026-10-30) do not say whether count requests are billed or rate-limited; they only say counting does not generate output or record generation usage. This report does not assume they are free.
- **Provider guard:** AI_PROVIDER resolved to meta (refuses to run otherwise). Verified that the mock specimen shortcut does not recognise a real specimen. The mock provider is not used.
- **Preflight:** reasoning_effort=medium with a strict json_schema (incl. minItems/maxItems) returned valid output (cached result). reasoning_effort=low with a strict json_schema (incl. minItems/maxItems) returned valid output.
- **Selfies:** never sent to the model; the pipeline only quality-checks them.

## Repeatability experiment

Extraction only, 10 unique documents × 3 repeats per reasoning effort; the truth document_type is passed in, so classification is not tested. Documents with identical printed content and defects (same type, ground truth and image defects) are extracted once, even when their PNG bytes differ by rendering noise. Rates are over fields present in the truth: the mean across repeats with the range (lowest–highest repeat) in brackets.

| Effort | Calls live / cached | Box pass rate | Box pass: ID | Box pass: bills | Value accuracy | Agreement across repeats | Mean latency (live) | Tokens in / out / reasoning | Cost (live) | length failures | Other failures |
|---|---|---|---|---|---|---|---|---|---|---|---|
| medium | 30 / 0 | 79.2% (77.1–81.3%) | 100.0% (100.0–100.0%) | 58.3% (54.2–62.5%) | 97.9% (97.9–97.9%) | 60/60 (100%) | 8947 ms | 82650 / 34619 / 27676 | $0.2288 | 0 | 0 |
| low | 30 / 0 | 88.9% (83.3–95.8%) | 97.2% (95.8–100.0%) | 80.6% (66.7–95.8%) | 100.0% (100.0–100.0%) | 60/60 (100%) | 5676 ms | 82650 / 22775 / 15312 | $0.1758 | 0 | 0 |

### Failed boxes: where they land

Mean with range in brackets, over every failed box the model returned. Offset is the model box centre minus the truth box centre in percent of the 0-1000 grid (positive = right / down); size is model ÷ truth.

| Effort | Failed boxes | Offset dx | Offset dy | Width ratio | Height ratio |
|---|---|---|---|---|---|
| medium | 30 | -0.2% (-2.1 to 1.4) | +1.1% (0.8 to 1.6) | 1.05× (0.98–1.16) | 0.91× (0.74–1.05) |
| low | 16 | +0.0% (-2.4 to 1.3) | +1.1% (-2.1 to 2.8) | 1.04× (0.98–1.18) | 0.87× (0.65–1.05) |

## Documents and fields

### [p1-clean/id.png · effort medium · repeat 0](overlays/p1-clean_id_medium_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png · effort medium · repeat 0](overlays/p1-clean_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.58 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.49 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.57 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort medium · repeat 0](overlays/p2-clean_id_medium_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.59 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.56 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort medium · repeat 0](overlays/p2-clean_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.39 | ✓ | ✗ | +1.4% / +0.9% | 1.16× / 0.92× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.18 | ✗ | ✗ | -1.2% / +1.2% | 1.16× / 0.89× | ✗ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.23 | ✗ | ✗ | -0.1% / +1.1% | 1.01× / 0.95× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.18 | ✗ | ✗ | +0.1% / +1.6% | 1.01× / 0.88× | ✗ |

### [p1-expired/id.png · effort medium · repeat 0](overlays/p1-expired_id_medium_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.71 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.69 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort medium · repeat 0](overlays/p1-expired_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.49 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.34 | ✓ | ✗ | -1.1% / +0.8% | 1.16× / 0.74× | ✗ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.44 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort medium · repeat 0](overlays/p2-name-mismatch_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.47 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.47 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort medium · repeat 0](overlays/p1-address-mismatch_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.53 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.33 | ✓ | ✗ | +0.0% / +0.9% | 1.00× / 0.89× | ✗ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.35 | ✓ | ✗ | +0.1% / +0.8% | 0.99× / 0.79× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort medium · repeat 0](overlays/p2-blurry_id_medium_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.71 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VDBR3N6W1H | ✗ | – | 0.73 | ✓ | ✓ | – | – | ✗ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.70 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.71 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.76 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort medium · repeat 0](overlays/p2-blurry_bill_medium_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.52 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.30 | ✓ | ✗ | +0.1% / +0.9% | 1.01× / 0.84× | ✗ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.48 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.20 | ✗ | ✗ | +0.0% / +1.6% | 1.01× / 0.96× | ✗ |

### [p1-clean/id.png · effort medium · repeat 1](overlays/p1-clean_id_medium_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.73 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.59 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.63 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png · effort medium · repeat 1](overlays/p1-clean_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.57 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.51 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.82 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort medium · repeat 1](overlays/p2-clean_id_medium_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.61 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.57 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.59 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort medium · repeat 1](overlays/p2-clean_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.39 | ✓ | ✗ | +1.3% / +0.9% | 1.14× / 0.83× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.18 | ✗ | ✗ | -1.1% / +1.2% | 1.16× / 0.89× | ✗ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.29 | ✓ | ✗ | -1.1% / +0.9% | 1.15× / 0.95× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.25 | ✗ | ✗ | +0.1% / +1.4% | 1.01× / 0.88× | ✗ |

### [p1-expired/id.png · effort medium · repeat 1](overlays/p1-expired_id_medium_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.56 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.67 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.81 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort medium · repeat 1](overlays/p1-expired_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.43 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.33 | ✓ | ✗ | -2.1% / +0.8% | 1.03× / 0.84× | ✗ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.29 | ✓ | ✗ | -2.0% / +0.8% | 1.02× / 0.84× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort medium · repeat 1](overlays/p2-name-mismatch_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.81 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.87 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort medium · repeat 1](overlays/p1-address-mismatch_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.59 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.35 | ✓ | ✗ | +0.1% / +0.9% | 1.04× / 1.00× | ✗ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.22 | ✗ | ✗ | +0.3% / +1.2% | 1.01× / 1.00× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.55 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort medium · repeat 1](overlays/p2-blurry_id_medium_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.67 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.67 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VDBR3N6W1H | ✗ | – | 0.64 | ✓ | ✓ | – | – | ✗ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort medium · repeat 1](overlays/p2-blurry_bill_medium_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.62 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.36 | ✓ | ✗ | -0.3% / +0.8% | 1.05× / 0.95× | ✗ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.28 | ✗ | ✗ | +0.1% / +1.0% | 0.99× / 0.89× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.39 | ✓ | ✗ | +0.1% / +1.0% | 1.00× / 0.92× | ✗ |

### [p1-clean/id.png · effort medium · repeat 2](overlays/p1-clean_id_medium_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.55 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.49 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.46 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png · effort medium · repeat 2](overlays/p1-clean_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.80 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.51 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.48 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.77 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort medium · repeat 2](overlays/p2-clean_id_medium_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.61 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.63 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.67 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort medium · repeat 2](overlays/p2-clean_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.47 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.16 | ✗ | ✗ | -0.1% / +1.3% | 1.03× / 0.89× | ✗ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.19 | ✗ | ✗ | +0.1% / +1.3% | 0.99× / 0.95× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.33 | ✓ | ✗ | +0.1% / +1.1% | 1.01× / 0.83× | ✗ |

### [p1-expired/id.png · effort medium · repeat 2](overlays/p1-expired_id_medium_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.78 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.73 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.74 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.67 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort medium · repeat 2](overlays/p1-expired_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.59 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.56 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.52 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.76 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort medium · repeat 2](overlays/p2-name-mismatch_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.54 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.20 | ✗ | ✗ | +0.3% / +1.1% | 0.98× / 0.84× | ✗ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.20 | ✗ | ✗ | +0.3% / +1.1% | 0.99× / 0.84× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.56 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort medium · repeat 2](overlays/p1-address-mismatch_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.49 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.38 | ✓ | ✗ | +0.2% / +0.8% | 1.00× / 0.89× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.87 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort medium · repeat 2](overlays/p2-blurry_id_medium_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VDBR3N6W1H | ✗ | – | 0.65 | ✓ | ✓ | – | – | ✗ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.71 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.76 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort medium · repeat 2](overlays/p2-blurry_bill_medium_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.40 | ✓ | ✗ | +1.3% / +0.9% | 1.14× / 1.04× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.24 | ✗ | ✗ | -1.1% / +1.1% | 1.15× / 1.05× | ✗ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.23 | ✗ | ✗ | -1.1% / +1.1% | 1.16× / 1.05× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.22 | ✗ | ✗ | +0.1% / +1.6% | 1.00× / 1.04× | ✗ |

### [p1-clean/id.png · effort low · repeat 0](overlays/p1-clean_id_low_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.62 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.56 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.49 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png · effort low · repeat 0](overlays/p1-clean_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.78 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.78 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.71 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.89 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort low · repeat 0](overlays/p2-clean_id_low_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.57 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.59 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort low · repeat 0](overlays/p2-clean_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.55 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.87 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/id.png · effort low · repeat 0](overlays/p1-expired_id_low_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.35 | ✓ | ✗ | +0.1% / -2.1% | 1.01× / 0.65× | ✗ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.59 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.67 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.69 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.71 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort low · repeat 0](overlays/p1-expired_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.82 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.63 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.57 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.85 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort low · repeat 0](overlays/p2-name-mismatch_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.75 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort low · repeat 0](overlays/p1-address-mismatch_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.62 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.43 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.34 | ✓ | ✗ | +0.5% / +0.8% | 0.98× / 0.79× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.73 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort low · repeat 0](overlays/p2-blurry_id_low_r0.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.77 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.79 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.81 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.73 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort low · repeat 0](overlays/p2-blurry_bill_low_r0.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.67 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.49 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/id.png · effort low · repeat 1](overlays/p1-clean_id_low_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.75 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.63 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.25 | ✗ | ✗ | -0.7% / +2.8% | 1.02× / 0.71× | ✗ |

### [p1-clean/bill.png · effort low · repeat 1](overlays/p1-clean_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.61 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.52 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.52 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.78 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort low · repeat 1](overlays/p2-clean_id_low_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.63 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort low · repeat 1](overlays/p2-clean_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.39 | ✓ | ✗ | -2.4% / +0.6% | 1.03× / 0.89× | ✗ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.52 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.83 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/id.png · effort low · repeat 1](overlays/p1-expired_id_low_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort low · repeat 1](overlays/p1-expired_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.56 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.86 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort low · repeat 1](overlays/p2-name-mismatch_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.41 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.37 | ✓ | ✗ | +0.4% / +0.8% | 0.99× / 0.89× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.83 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort low · repeat 1](overlays/p1-address-mismatch_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.28 | ✗ | ✗ | +0.0% / +1.3% | 1.00× / 0.92× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.03 | ✗ | ✗ | +0.0% / +1.8% | 1.00× / 0.95× | ✗ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.03 | ✗ | ✗ | +0.1% / +1.8% | 0.99× / 1.00× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.52 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort low · repeat 1](overlays/p2-blurry_id_low_r1.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.69 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.71 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort low · repeat 1](overlays/p2-blurry_bill_low_r1.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.77 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.88 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.87 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/id.png · effort low · repeat 2](overlays/p1-clean_id_low_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.66 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.46 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.42 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png · effort low · repeat 2](overlays/p1-clean_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.37 | ✓ | ✗ | -0.1% / +1.0% | 0.99× / 0.83× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.22 | ✗ | ✗ | +0.9% / +1.1% | 1.18× / 0.89× | ✗ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.11 | ✗ | ✗ | +1.3% / +1.5% | 1.12× / 1.00× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.55 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png · effort low · repeat 2](overlays/p2-clean_id_low_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.57 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.56 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.63 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png · effort low · repeat 2](overlays/p2-clean_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.52 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.75 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.98 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.80 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/id.png · effort low · repeat 2](overlays/p1-expired_id_low_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.65 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.83 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.72 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.73 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.76 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png · effort low · repeat 2](overlays/p1-expired_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.82 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.60 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.84 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png · effort low · repeat 2](overlays/p2-name-mismatch_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.70 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.60 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.75 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png · effort low · repeat 2](overlays/p1-address-mismatch_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.81 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.50 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.29 | ✗ | ✗ | +0.3% / +1.1% | 1.02× / 1.05× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.81 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/id.png · effort low · repeat 2](overlays/p2-blurry_id_low_r2.html)

Truth type `national_id` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.71 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.67 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.74 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.68 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.69 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |

### [p2-blurry/bill.png · effort low · repeat 2](overlays/p2-blurry_bill_low_r2.html)

Truth type `utility_bill` (passed in) · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.22 | ✗ | ✗ | +1.1% / +1.3% | 1.12× / 0.75× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-19313-96046 | QW-19313-96046 | ✓ | – | 0.06 | ✗ | ✗ | -1.1% / +1.6% | 1.15× / 0.84× | ✗ |
| issue_date | 2026-10-18 | 2026-10-18 | ✓ | ✓ | 0.06 | ✗ | ✗ | +0.1% / +1.6% | 0.99× / 0.84× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.17 | ✗ | ✗ | +0.1% / +1.6% | 1.01× / 0.96× | ✗ |

## Calls

| # | Case | Step | Doc | Model | Effort | Repeat | Input | Output | Reasoning | Latency ms | Cached | finish_reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | preflight | preflight | – | muse-spark-1.3 | medium | – | 18 | 555 | 532 | – | cached | stop |
| 2 | preflight | preflight | – | muse-spark-1.3 | low | – | 18 | 302 | 282 | 1939 | live | stop |
| 3 | extract-medium-r0 | extraction | p1-clean/id.png | muse-spark-1.3 | medium | 0 | 2569 | 1065 | 787 | 19491 | live | stop |
| 4 | extract-medium-r0 | extraction | p1-clean/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 1244 | 1050 | 13373 | live | stop |
| 5 | extract-medium-r0 | extraction | p2-clean/id.png | muse-spark-1.3 | medium | 0 | 2569 | 1157 | 880 | 17187 | live | stop |
| 6 | extract-medium-r0 | extraction | p2-clean/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 2023 | 1765 | 11372 | live | stop |
| 7 | extract-medium-r0 | extraction | p1-expired/id.png | muse-spark-1.3 | medium | 0 | 2569 | 926 | 713 | 16956 | live | stop |
| 8 | extract-medium-r0 | extraction | p1-expired/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 1212 | 1018 | 10102 | live | stop |
| 9 | extract-medium-r0 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 1169 | 910 | 17727 | live | stop |
| 10 | extract-medium-r0 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 1404 | 1211 | 7250 | live | stop |
| 11 | extract-medium-r0 | extraction | p2-blurry/id.png | muse-spark-1.3 | medium | 0 | 2569 | 1037 | 825 | 14811 | live | stop |
| 12 | extract-medium-r0 | extraction | p2-blurry/bill.png | muse-spark-1.3 | medium | 0 | 2879 | 1251 | 1058 | 11847 | live | stop |
| 13 | extract-medium-r1 | extraction | p1-clean/id.png | muse-spark-1.3 | medium | 1 | 2569 | 999 | 721 | 7066 | live | stop |
| 14 | extract-medium-r1 | extraction | p1-clean/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 1658 | 1399 | 6245 | live | stop |
| 15 | extract-medium-r1 | extraction | p2-clean/id.png | muse-spark-1.3 | medium | 1 | 2569 | 1283 | 1071 | 11048 | live | stop |
| 16 | extract-medium-r1 | extraction | p2-clean/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 959 | 701 | 5950 | live | stop |
| 17 | extract-medium-r1 | extraction | p1-expired/id.png | muse-spark-1.3 | medium | 1 | 2569 | 1043 | 765 | 5245 | live | stop |
| 18 | extract-medium-r1 | extraction | p1-expired/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 1115 | 856 | 5609 | live | stop |
| 19 | extract-medium-r1 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 821 | 627 | 4495 | live | stop |
| 20 | extract-medium-r1 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 1495 | 1302 | 6223 | live | stop |
| 21 | extract-medium-r1 | extraction | p2-blurry/id.png | muse-spark-1.3 | medium | 1 | 2569 | 1273 | 996 | 5965 | live | stop |
| 22 | extract-medium-r1 | extraction | p2-blurry/bill.png | muse-spark-1.3 | medium | 1 | 2879 | 1108 | 850 | 6692 | live | stop |
| 23 | extract-medium-r2 | extraction | p1-clean/id.png | muse-spark-1.3 | medium | 2 | 2569 | 977 | 699 | 4962 | live | stop |
| 24 | extract-medium-r2 | extraction | p1-clean/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 828 | 634 | 4264 | live | stop |
| 25 | extract-medium-r2 | extraction | p2-clean/id.png | muse-spark-1.3 | medium | 2 | 2569 | 1098 | 886 | 5588 | live | stop |
| 26 | extract-medium-r2 | extraction | p2-clean/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 942 | 749 | 6128 | live | stop |
| 27 | extract-medium-r2 | extraction | p1-expired/id.png | muse-spark-1.3 | medium | 2 | 2569 | 889 | 676 | 9220 | live | stop |
| 28 | extract-medium-r2 | extraction | p1-expired/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 1026 | 832 | 5476 | live | stop |
| 29 | extract-medium-r2 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 1130 | 871 | 7331 | live | stop |
| 30 | extract-medium-r2 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 1426 | 1168 | 7287 | live | stop |
| 31 | extract-medium-r2 | extraction | p2-blurry/id.png | muse-spark-1.3 | medium | 2 | 2569 | 987 | 775 | 8818 | live | stop |
| 32 | extract-medium-r2 | extraction | p2-blurry/bill.png | muse-spark-1.3 | medium | 2 | 2879 | 1074 | 881 | 4685 | live | stop |
| 33 | extract-low-r0 | extraction | p1-clean/id.png | muse-spark-1.3 | low | 0 | 2569 | 752 | 474 | 6727 | live | stop |
| 34 | extract-low-r0 | extraction | p1-clean/bill.png | muse-spark-1.3 | low | 0 | 2879 | 725 | 466 | 4563 | live | stop |
| 35 | extract-low-r0 | extraction | p2-clean/id.png | muse-spark-1.3 | low | 0 | 2569 | 736 | 459 | 7336 | live | stop |
| 36 | extract-low-r0 | extraction | p2-clean/bill.png | muse-spark-1.3 | low | 0 | 2879 | 777 | 519 | 5287 | live | stop |
| 37 | extract-low-r0 | extraction | p1-expired/id.png | muse-spark-1.3 | low | 0 | 2569 | 813 | 535 | 7685 | live | stop |
| 38 | extract-low-r0 | extraction | p1-expired/bill.png | muse-spark-1.3 | low | 0 | 2879 | 755 | 561 | 4787 | live | stop |
| 39 | extract-low-r0 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | low | 0 | 2879 | 739 | 545 | 5028 | live | stop |
| 40 | extract-low-r0 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | low | 0 | 2879 | 886 | 628 | 4876 | live | stop |
| 41 | extract-low-r0 | extraction | p2-blurry/id.png | muse-spark-1.3 | low | 0 | 2569 | 633 | 356 | 6539 | live | stop |
| 42 | extract-low-r0 | extraction | p2-blurry/bill.png | muse-spark-1.3 | low | 0 | 2879 | 718 | 460 | 4806 | live | stop |
| 43 | extract-low-r1 | extraction | p1-clean/id.png | muse-spark-1.3 | low | 1 | 2569 | 670 | 457 | 4876 | live | stop |
| 44 | extract-low-r1 | extraction | p1-clean/bill.png | muse-spark-1.3 | low | 1 | 2879 | 631 | 437 | 4551 | live | stop |
| 45 | extract-low-r1 | extraction | p2-clean/id.png | muse-spark-1.3 | low | 1 | 2569 | 655 | 378 | 5813 | live | stop |
| 46 | extract-low-r1 | extraction | p2-clean/bill.png | muse-spark-1.3 | low | 1 | 2879 | 833 | 575 | 4908 | live | stop |
| 47 | extract-low-r1 | extraction | p1-expired/id.png | muse-spark-1.3 | low | 1 | 2569 | 532 | 319 | 6024 | live | stop |
| 48 | extract-low-r1 | extraction | p1-expired/bill.png | muse-spark-1.3 | low | 1 | 2879 | 739 | 545 | 4347 | live | stop |
| 49 | extract-low-r1 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | low | 1 | 2879 | 723 | 464 | 4654 | live | stop |
| 50 | extract-low-r1 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | low | 1 | 2879 | 982 | 724 | 5469 | live | stop |
| 51 | extract-low-r1 | extraction | p2-blurry/id.png | muse-spark-1.3 | low | 1 | 2569 | 726 | 514 | 6809 | live | stop |
| 52 | extract-low-r1 | extraction | p2-blurry/bill.png | muse-spark-1.3 | low | 1 | 2879 | 972 | 714 | 6242 | live | stop |
| 53 | extract-low-r2 | extraction | p1-clean/id.png | muse-spark-1.3 | low | 2 | 2569 | 678 | 400 | 7476 | live | stop |
| 54 | extract-low-r2 | extraction | p1-clean/bill.png | muse-spark-1.3 | low | 2 | 2879 | 752 | 493 | 5752 | live | stop |
| 55 | extract-low-r2 | extraction | p2-clean/id.png | muse-spark-1.3 | low | 2 | 2569 | 678 | 466 | 7832 | live | stop |
| 56 | extract-low-r2 | extraction | p2-clean/bill.png | muse-spark-1.3 | low | 2 | 2879 | 795 | 537 | 4837 | live | stop |
| 57 | extract-low-r2 | extraction | p1-expired/id.png | muse-spark-1.3 | low | 2 | 2569 | 780 | 502 | 5677 | live | stop |
| 58 | extract-low-r2 | extraction | p1-expired/bill.png | muse-spark-1.3 | low | 2 | 2879 | 837 | 578 | 5607 | live | stop |
| 59 | extract-low-r2 | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | low | 2 | 2879 | 854 | 595 | 5453 | live | stop |
| 60 | extract-low-r2 | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | low | 2 | 2879 | 860 | 602 | 5211 | live | stop |
| 61 | extract-low-r2 | extraction | p2-blurry/id.png | muse-spark-1.3 | low | 2 | 2569 | 617 | 340 | 5853 | live | stop |
| 62 | extract-low-r2 | extraction | p2-blurry/bill.png | muse-spark-1.3 | low | 2 | 2879 | 927 | 669 | 5245 | live | stop |

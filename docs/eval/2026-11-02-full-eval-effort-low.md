# Meta eval report

Run 2026-11-02T04:31:53.701Z → 2026-11-02T04:33:26.896Z · model `muse-spark-1.3`

## Rules and settings

- **Box rule:** A box passes when the centre of the model's box lies inside the truth box AND IoU >= 0.4. Truth boxes include the text's line padding while model boxes tend to be tight, so IoU alone under-scores; it is still reported for every box.
- **Box diagnostics (failed boxes only):** centre offset dx / dy of the model box from the truth box, in percent of the 0-1000 grid (positive = right / down), and size ratio width / height (model ÷ truth).
- **Overlays:** each document heading links to a page with model boxes in red and truth boxes in green.
- **Value rule:** Values are compared with truth.normalized, case-insensitive, with whitespace collapsed. Dates are first parsed to YYYY-MM-DD (e.g. "09 MAY 2031", "9 May 2031", "May 9, 2031", "2031-05-09"); whether the model returned the requested YYYY-MM-DD format is reported separately.
- **Classification:** `classifyDocument` compared with truth.document_type for every document.
- **Reasoning effort used:** doc_class=low, extraction=low, compare=low, summary=low, guidance=low
- **max_completion_tokens:** doc_class=2000, extraction=4000, compare=2000, summary=2000, guidance=2000. A finish_reason of `length` is reported as its own failure type.
- **Prices (USD per 1M tokens):** input 1.25, cached input 0.15, output incl. reasoning 4.25 (https://dev.meta.ai/docs/pricing-rate-limits, checked 2026-10-30).
- **Call cap:** 80 live calls. Cached responses do not count toward the cap or the token totals.
- **Cache:** on (eval\.cache\meta)
- **Token counting:** 2 live count requests, 12 served from cache. Meta's token-counting docs (https://dev.meta.ai/docs/token-counting, checked 2026-10-30) do not say whether count requests are billed or rate-limited; they only say counting does not generate output or record generation usage. This report does not assume they are free.
- **Provider guard:** AI_PROVIDER resolved to meta (refuses to run otherwise). Verified that the mock specimen shortcut does not recognise a real specimen. The mock provider is not used.
- **Preflight:** reasoning_effort=low with a strict json_schema (incl. minItems/maxItems) returned valid output (cached result).
- **Selfies:** never sent to the model; the pipeline only quality-checks them.

## Summary

| Metric | Result |
|---|---|
| Decisions as expected | 6/6 (100%) |
| Expected flag codes raised | 6/6 (100%) |
| Classification correct | 10/10 (100%) |
| Field values correct (present in truth) | 50/50 (100%) |
| Boxes passing (present in truth) | 43/50 (86%) |
| Boxes passing: ID documents | 30/30 (100%) |
| Boxes passing: Bills | 13/20 (65%) |
| Absent fields reported absent | 10/10 (100%) |
| Dates returned as YYYY-MM-DD | 20/20 (100%) |
| Live calls / cached | 10 / 21 |
| Tokens (live calls): input / output / reasoning / cached input | 27240 / 7792 / 5241 / 51 |
| Cost of live calls (from reported usage) | $0.0671 |

## Cases

| Case | Policy | as_of | Expected | Got | Decision | Codes expected → raised | Calls planned / live / cached | Failure |
|---|---|---|---|---|---|---|---|---|
| p1-clean | housing-loan | 2026-11-01 | auto_approve | auto_approve | ✓ | none → none ✓ | 5 / 2 / 3 | – |
| p2-clean | housing-loan | 2026-11-01 | auto_approve | auto_approve | ✓ | none → none ✓ | 5 / 2 / 3 | – |
| p1-expired | housing-loan | 2026-11-01 | request_info | request_info | ✓ | document_expired → document_expired ✓ | 6 / 2 / 4 | – |
| p2-name-mismatch | housing-loan | 2026-11-01 | manual_review | manual_review | ✓ | full_name_mismatch → full_name_mismatch ✓ | 6 / 2 / 4 | – |
| p1-address-mismatch | housing-loan | 2026-11-01 | manual_review | manual_review | ✓ | address_mismatch → address_mismatch ✓ | 6 / 2 / 4 | – |
| p2-blurry | housing-loan | 2026-11-01 | request_info | request_info | ✓ | quality_failed → quality_failed ✓ | 2 / 0 / 2 | – |

## Documents and fields

### [p1-clean/id.png](overlays/p1-clean_id.html)

Classification: predicted `national_id`, truth `national_id` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.58 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.54 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.71 | ✓ | ✓ | – | – | ✓ |

### [p1-clean/bill.png](overlays/p1-clean_bill.html)

Classification: predicted `utility_bill`, truth `utility_bill` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.73 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-80988-26579 | QW-80988-26579 | ✓ | – | 0.48 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-09-24 | 2026-09-24 | ✓ | ✓ | 0.51 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.83 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/id.png](overlays/p2-clean_id.html)

Classification: predicted `national_id`, truth `national_id` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.54 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.58 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.60 | ✓ | ✓ | – | – | ✓ |

### [p2-clean/bill.png](overlays/p2-clean_bill.html)

Classification: predicted `utility_bill`, truth `utility_bill` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | Tobias Wrenfield | ✓ | – | 0.68 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-88218-60939 | QW-88218-60939 | ✓ | – | 0.23 | ✗ | ✗ | -2.1% / +1.1% | 1.05× / 0.95× | ✗ |
| issue_date | 2026-09-27 | 2026-09-27 | ✓ | ✓ | 0.21 | ✗ | ✗ | -0.8% / +1.2% | 0.89× / 1.00× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.36 | ✓ | ✗ | +0.1% / +1.1% | 1.00× / 0.88× | ✗ |

### [p1-expired/id.png](overlays/p1-expired_id.html)

Classification: predicted `national_id`, truth `national_id` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2016-08-19 | 2016-08-19 | ✓ | ✓ | 0.66 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2026-08-18 | 2026-08-18 | ✓ | ✓ | 0.66 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.71 | ✓ | ✓ | – | – | ✓ |

### [p1-expired/bill.png](overlays/p1-expired_bill.html)

Classification: predicted `utility_bill`, truth `utility_bill` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.00 | ✗ | ✗ | -0.1% / +4.5% | 0.99× / 0.88× | ✗ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-10267-34459 | QW-10267-34459 | ✓ | – | 0.00 | ✗ | ✗ | -1.1% / +2.0% | 1.16× / 0.79× | ✗ |
| issue_date | 2026-10-22 | 2026-10-22 | ✓ | ✓ | 0.00 | ✗ | ✗ | -1.0% / +2.1% | 1.16× / 0.89× | ✗ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.04 | ✗ | ✗ | -0.3% / +4.5% | 0.99× / 0.94× | ✗ |

### [p2-name-mismatch/id.png](overlays/p2-name-mismatch_id.html)

Classification: predicted `national_id`, truth `national_id` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Tobias Wrenfield | TOBIAS WRENFIELD | ✓ | – | 0.61 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1979-11-02 | 1979-11-02 | ✓ | ✓ | 0.61 | ✓ | ✓ | – | – | ✓ |
| document_number | VD8R3N6W1H | VD8R3N6W1H | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2022-09-01 | 2022-09-01 | ✓ | ✓ | 0.64 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2032-08-31 | 2032-08-31 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |

### [p2-name-mismatch/bill.png](overlays/p2-name-mismatch_bill.html)

Classification: predicted `utility_bill`, truth `utility_bill` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Brannoch Wrenfield | Brannoch Wrenfield | ✓ | – | 0.72 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-55733-56655 | QW-55733-56655 | ✓ | – | 0.78 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-14 | 2026-10-14 | ✓ | ✓ | 0.73 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 7 Brindlewick Lane, Hollowmere 31862 | 7 Brindlewick Lane, Hollowmere 31862 | ✓ | – | 0.83 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/id.png](overlays/p1-address-mismatch_id.html)

Classification: predicted `national_id`, truth `national_id` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | ELIN THORNQUIST | ✓ | – | 0.61 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | 1988-06-14 | 1988-06-14 | ✓ | ✓ | 0.53 | ✓ | ✓ | – | – | ✓ |
| document_number | VD4K7Q2M9T | VD4K7Q2M9T | ✓ | – | 0.69 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2021-05-10 | 2021-05-10 | ✓ | ✓ | 0.60 | ✓ | ✓ | – | – | ✓ |
| expiry_date | 2031-05-09 | 2031-05-09 | ✓ | ✓ | 0.62 | ✓ | ✓ | – | – | ✓ |
| address | 14 Quillfeather Row, Ambermoor 20417 | 14 Quillfeather Row, Ambermoor 20417 | ✓ | – | 0.64 | ✓ | ✓ | – | – | ✓ |

### [p1-address-mismatch/bill.png](overlays/p1-address-mismatch_bill.html)

Classification: predicted `utility_bill`, truth `utility_bill` ✓ · extraction live

| Field | Truth (normalized) | Model value | Value | YYYY-MM-DD | IoU | Centre in | Box | Offset dx / dy | Size w / h | Pass |
|---|---|---|---|---|---|---|---|---|---|---|
| full_name | Elin Thornquist | Elin Thornquist | ✓ | – | 0.65 | ✓ | ✓ | – | – | ✓ |
| date_of_birth | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| document_number | QW-76629-60842 | QW-76629-60842 | ✓ | – | 0.47 | ✓ | ✓ | – | – | ✓ |
| issue_date | 2026-10-01 | 2026-10-01 | ✓ | ✓ | 0.67 | ✓ | ✓ | – | – | ✓ |
| expiry_date | (absent) | (absent) | ✓ | – | – | – | – | – | – | ✓ |
| address | 58 Mistlethorn Road, Ambermoor 20433 | 58 Mistlethorn Road, Ambermoor 20433 | ✓ | – | 0.79 | ✓ | ✓ | – | – | ✓ |

### p2-blurry/id.png

Classification: predicted `not run`, truth `national_id` – · extraction not run

### p2-blurry/bill.png

Classification: predicted `not run`, truth `utility_bill` – · extraction not run

## Calls

| # | Case | Step | Doc | Model | Effort | Repeat | Input | Output | Reasoning | Latency ms | Cached | finish_reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | preflight | preflight | – | muse-spark-1.3 | low | – | 18 | 302 | 282 | – | cached | stop |
| 2 | p1-clean | doc_class | p1-clean/id.png | muse-spark-1.3 | low | – | 2451 | 214 | 189 | – | cached | stop |
| 3 | p1-clean | extraction | p1-clean/id.png | muse-spark-1.3 | low | – | 2569 | 707 | 494 | 6579 | live | stop |
| 4 | p1-clean | doc_class | p1-clean/bill.png | muse-spark-1.3 | low | – | 2761 | 270 | 245 | – | cached | stop |
| 5 | p1-clean | extraction | p1-clean/bill.png | muse-spark-1.3 | low | – | 2879 | 783 | 524 | 5987 | live | stop |
| 6 | p1-clean | summary | – | muse-spark-1.3 | low | – | 51 | 494 | 463 | – | cached | stop |
| 7 | p2-clean | doc_class | p2-clean/id.png | muse-spark-1.3 | low | – | 2451 | 256 | 231 | – | cached | stop |
| 8 | p2-clean | extraction | p2-clean/id.png | muse-spark-1.3 | low | – | 2569 | 544 | 332 | 6787 | live | stop |
| 9 | p2-clean | doc_class | p2-clean/bill.png | muse-spark-1.3 | low | – | 2761 | 191 | 166 | – | cached | stop |
| 10 | p2-clean | extraction | p2-clean/bill.png | muse-spark-1.3 | low | – | 2879 | 912 | 654 | 7046 | live | stop |
| 11 | p2-clean | summary | – | muse-spark-1.3 | low | – | 51 | 494 | 463 | – | cached | stop |
| 12 | p1-expired | doc_class | p1-expired/id.png | muse-spark-1.3 | low | – | 2451 | 246 | 221 | – | cached | stop |
| 13 | p1-expired | extraction | p1-expired/id.png | muse-spark-1.3 | low | – | 2569 | 708 | 430 | 6061 | live | stop |
| 14 | p1-expired | doc_class | p1-expired/bill.png | muse-spark-1.3 | low | – | 2761 | 137 | 112 | – | cached | stop |
| 15 | p1-expired | extraction | p1-expired/bill.png | muse-spark-1.3 | low | – | 2879 | 824 | 565 | 16749 | live | stop |
| 16 | p1-expired | summary | – | muse-spark-1.3 | low | – | 66 | 575 | 529 | – | cached | stop |
| 17 | p1-expired | guidance | – | muse-spark-1.3 | low | – | 47 | 390 | 324 | – | cached | stop |
| 18 | p2-name-mismatch | doc_class | p2-name-mismatch/id.png | muse-spark-1.3 | low | – | 2451 | 217 | 192 | – | cached | stop |
| 19 | p2-name-mismatch | extraction | p2-name-mismatch/id.png | muse-spark-1.3 | low | – | 2569 | 726 | 449 | 6869 | live | stop |
| 20 | p2-name-mismatch | doc_class | p2-name-mismatch/bill.png | muse-spark-1.3 | low | – | 2761 | 218 | 193 | – | cached | stop |
| 21 | p2-name-mismatch | extraction | p2-name-mismatch/bill.png | muse-spark-1.3 | low | – | 2879 | 962 | 703 | 6290 | live | stop |
| 22 | p2-name-mismatch | compare | – | muse-spark-1.3 | low | – | 52 | 398 | 320 | – | cached | stop |
| 23 | p2-name-mismatch | summary | – | muse-spark-1.3 | low | – | 114 | 698 | 616 | – | cached | stop |
| 24 | p1-address-mismatch | doc_class | p1-address-mismatch/id.png | muse-spark-1.3 | low | – | 2451 | 258 | 233 | – | cached | stop |
| 25 | p1-address-mismatch | extraction | p1-address-mismatch/id.png | muse-spark-1.3 | low | – | 2569 | 803 | 525 | 7920 | live | stop |
| 26 | p1-address-mismatch | doc_class | p1-address-mismatch/bill.png | muse-spark-1.3 | low | – | 2761 | 240 | 215 | – | cached | stop |
| 27 | p1-address-mismatch | extraction | p1-address-mismatch/bill.png | muse-spark-1.3 | low | – | 2879 | 823 | 565 | 5663 | live | stop |
| 28 | p1-address-mismatch | compare | – | muse-spark-1.3 | low | – | 65 | 469 | 400 | – | cached | stop |
| 29 | p1-address-mismatch | summary | – | muse-spark-1.3 | low | – | 104 | 563 | 480 | – | cached | stop |
| 30 | p2-blurry | summary | – | muse-spark-1.3 | low | – | 71 | 754 | 704 | – | cached | stop |
| 31 | p2-blurry | guidance | – | muse-spark-1.3 | low | – | 52 | 375 | 309 | – | cached | stop |

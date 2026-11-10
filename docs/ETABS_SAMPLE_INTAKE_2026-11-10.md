# ETABS sample intake — 2026-11-10 (original .e2k published)

**Status:** ETABS sample supplied in a ChatGPT conversation, inspected, and **original `.e2k` committed to public `main` with the owner's explicit permission**. SAP2000 `.s2k` sample is still pending from the owner. This note updates the approved [CSI Import & Validation plan](CSI_IMPORT_VALIDATION_PLAN.md).

## Files received (five attachments from one model family)

| Extension | Inspected type | Notes |
| --- | --- | --- |
| `.e2k` | Readable ETABS text model | Header declares ETABS **23.2.0**. Primary candidate for CSI Text Import fixture. |
| `.$et` | Readable ETABS text model variant | Also declares ETABS **23.2.0**. Strong near-match to `.e2k`; differs in temperature units and a few metadata/thermal parameters. |
| `.EDB` | ETABS native binary model | Header contains ETABS **23.2.0**; native content not parsed. |
| `.ebk` | ETABS native binary backup | Header contains ETABS **20.3.0**; do not assume it is identical to the current `.EDB`. |
| `.ico` | Actually PNG-encoded image (120x120) | Not an engineering model/import fixture. |

**Public ETABS fixture:** [`tests/fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k`](https://github.com/thai-coder/NexFEM/blob/main/tests/fixtures/csi/etabs/23217_SMFs%203D%20model_updated%20v4.e2k). The original `.e2k` is published **unchanged**, including any internal Windows path, model title and geometry it contains, as expressly authorized by the owner. The other four uploaded attachments are **not** in GitHub. Use this one real fixture to develop parser tests; do not presume additional data or publish other original files without separate permission.

## Verified `.e2k` structure (counts from the uploaded file)

| Item | Observed |
| --- | ---: |
| Text lines | 4,263 |
| Section headings (`$ ...`) | 51 |
| Unique points (`POINT`) | 546 |
| Frame connectivity records (`LINE`) | 322 (244 beams, 54 columns, 24 braces) |
| Area connectivity records (`AREA`) | 29 |
| Declared frame sections | 305 |
| Distinct materials | 9 |
| Load patterns | 11 |
| Distinct load cases | 12 |
| Distinct load combinations | 87 (represented by 837 `COMBO` lines) |
| Joint force load records | 31 |
| Frame load records | 24 (14 `UNIFF`, 10 `TRAPF`) |
| Area load records | 16 |

Relevant blocks include: `PROGRAM INFORMATION`, `CONTROLS`, `STORIES`, `GRIDS`, `MATERIAL PROPERTIES`, `FRAME SECTIONS`, `POINT COORDINATES`, `LINE CONNECTIVITIES`, `AREA CONNECTIVITIES`, `POINT ASSIGNS`, `LINE ASSIGNS`, `AREA ASSIGNS`, `LOAD PATTERNS`, `POINT OBJECT LOADS`, `FRAME OBJECT LOADS`, `SHELL OBJECT LOADS`, `LOAD CASES`, `LOAD COMBINATIONS`.

## Import/validation risks revealed by this sample

1. **Parser grammar:** line-wise records grouped by `$ SECTION`; the same named object has multiple records. Avoid overwriting or treating every record as a distinct entity. Some records have adjacent quoted fields and numeric field tokens without normal spacing.
2. **Units:** `.e2k` contains `UNITS "LB" "IN" "C"`; `.$et` contains `UNITS "LB" "IN" "F"`. Thermal expansion coefficients differ correspondingly (e.g., 1.17e-5 /°C versus 6.5e-6 /°F), an excellent unit-normalization regression. Do **not** assume byte identity.
3. **Complex features:** steel I / HSS sections, concrete-filled members, frame releases (including `PINNED`), section offsets, line springs, area springs, rigid diaphragm, story/grid definitions, joint loads, trapezoidal and uniform line loads, area loads, modal metadata and many load combinations. Several exceed NexFEM's present solver/model support.
4. **Separate parser success from solver equivalence:** every unsupported or partially mapped entity, load or constraint must be flagged. In particular, area springs/rigid diaphragm/actual shell behavior and joint loads must not be silently ignored if engineering results are presented.
5. **No result reference exported:** the inspected `.e2k` is a model definition file; it does not provide a verified displacement/reaction/frame-force result table. M2 comparison against actual ETABS analysis results remains **blocked** until separately exported reference tables (CSV/Excel/text) or equivalent trusted results are provided.
6. **Version coverage:** the text fixtures observed are ETABS 23.2.0. Native binary backup header shows an older ETABS version, but this does **not** prove text parser compatibility with ETABS 20.3.0.

## Updated milestone status

- **M0 — ETABS side: fixture available on GitHub.** One real, version-identified `.e2k` is committed on `main` at `tests/fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k`. SAP2000 `.s2k` and reference CSI analysis-result tables remain pending.
- **M1 — Import:** proceed immediately using the committed `.e2k` for parser grammar, full parsing tests, diagnostics and mapping to `model-core`. If working on a development branch, fetch `origin/main` to access this fixture.
- **M2 — Comparison:** write benchmark harness and analytic cases now, but **do not claim actual ETABS numeric validation** without exported CSI reference results.
- **M4 — OAPI:** remains deferred until M1/M2 acceptance as decided.

**Integrity and interpretation:** the `.e2k` was uploaded as original source data (not a processed mock). The intake note itself contains observations, not proof of successful import or CSI numerical validation.

## Original file integrity (GitHub fixture)

- Relative path: `tests/fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k`
- Byte size: **350310**; line count: **4263**; original line endings: CRLF.
- SHA-256: `01d6753b2894b657e78d2a4fc3b4842f95e8c85d384a30f90fc4c458d965f431`
- Git blob SHA-1: `c49d07245a3d87705570ad467eba897b917a52f4` (verified against original attachment before commit).
- Permission: owner expressly authorized publishing **this `.e2k` only** in the public repository.

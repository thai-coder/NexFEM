# ETABS sample intake — 2026-11-10 (metadata only)

**Status:** ETABS sample supplied in a ChatGPT conversation and inspected; **not checked into GitHub**. SAP2000 `.s2k` sample is still pending from the owner. This note updates the approved [CSI Import & Validation plan](CSI_IMPORT_VALIDATION_PLAN.md).

## Files received (five attachments from one model family)

| Extension | Inspected type | Notes |
| --- | --- | --- |
| `.e2k` | Readable ETABS text model | Header declares ETABS **23.2.0**. Primary candidate for CSI Text Import fixture. |
| `.$et` | Readable ETABS text model variant | Also declares ETABS **23.2.0**. Strong near-match to `.e2k`; differs in temperature units and a few metadata/thermal parameters. |
| `.EDB` | ETABS native binary model | Header contains ETABS **23.2.0**; native content not parsed. |
| `.ebk` | ETABS native binary backup | Header contains ETABS **20.3.0**; do not assume it is identical to the current `.EDB`. |
| `.ico` | Actually PNG-encoded image (120x120) | Not an engineering model/import fixture. |

**No raw file, raw log, internal Windows path, project title, private file identifier, or structure geometry has been published in this repository.** The uploads are **conversation attachments, not GitHub files**. Claude running solely against GitHub will see only this metadata, not the ETABS contents. Request explicit owner authorization and an agreed private/sanitized fixture distribution method before using these original engineering files in a repository.

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

- **M0 — ETABS side: partially unblocked.** One real, version-identified `.e2k` sample is available **in the conversation**; transfer into a secure fixture workspace still requires authorization. SAP2000 `.s2k` remains pending. Reference CSI analysis-result tables remain pending.
- **M1 — Import:** proceed with parser scaffolding, field/token grammar and supported-construct matrix; once a secure fixture is accessible to implementers, run full parsing and map to `model-core`.
- **M2 — Comparison:** write benchmark harness and analytic cases now, but **do not claim actual ETABS numeric validation** without exported CSI reference results.
- **M4 — OAPI:** remains deferred until M1/M2 acceptance as decided.

**Do not mistake this file inventory for source artifacts.** It is an intake note only, intentionally free of private raw uploads.

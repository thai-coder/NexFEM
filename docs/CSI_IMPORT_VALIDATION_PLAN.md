# NexFEM — CSI Text Import & benchmark validation plan

**Status:** Approved project priority (owner decision, 2026-11-09)  
**Repository:** `thai-coder/NexFEM`  
**Applies to:** implementation work on `claude/etab-sap2000-connection-vts58p` and successor branches  
**Relationship to earlier roadmap:** Reorders CSI interoperability work. Implement text import and engineering benchmarks **before** CSI OAPI. This does not mark either feature as complete.

## Decision and rationale

The immediate integration goal is to **reliably read ETABS `.e2k` and SAP2000 `.s2k` text exports into the NexFEM model**, then **compare results against trusted analytic and CSI reference cases**. File-based integration works without an installed/licensed CSI application and is reproducible on CI; solver comparison provides evidence of correctness before live automation.

**Order of work:** collect verified sample data → import MVP + tests → reference benchmarks and comparison report → extend import/export as needed → only then CSI OAPI bridge.

## Current baseline (as inspected 2026-11-09)

- Application branch contains a React/Tauri desktop app, `packages/model-core` model schema and validation, Rust linear-static frame solver (`crates/fem-solver`), WebAssembly solver, CI and a Windows installer.
- `docs/adr/0002-csi-interop.md` specifies two channels: text files and a separate C#/.NET CSI OAPI bridge.
- There is **no `packages/io-formats/csi/` or `bridge/csi/` implementation** in the inspected development branch. No real CSI comparison suite is recorded.
- The current solver does **not** provide full CSI equivalence (notably no general shell FEM, rigid diaphragm, P-Delta, modal or response spectrum).
- Previous UX notes identify missing real `.e2k`/`.s2k` fixture files as an immediate blocker.

## Milestones and acceptance criteria

### M0 — Reference inputs and specifications (first)

- Gather **actual exported** `.e2k` and `.s2k` files from documented ETABS/SAP2000 versions; keep source version, export options, units, coordinate system, origin, and reference output together.
- Start with small legally shareable models: cantilever beam, simply supported beam, 2D portal frame, 3D frame, and a small multistory frame. Add samples with frame releases, load patterns/combinations and slabs/walls for later coverage or explicit unsupported warnings.
- Obtain independent reference results (ETABS/SAP2000 tables exported as CSV/text, plus analytic solutions when possible): joint displacements, support reactions and frame forces at agreed stations.
- If real files are not yet available, prepare fixture manifests, parser interfaces and tests marked `pending real fixture`; **do not invent .e2k/.s2k grammar and claim it is verified**.

**Done when:** at least one version-labeled, independently checkable real export from **each** CSI product is available, or this milestone remains explicitly blocked.

### M1 — CSI Text Import MVP

- Implement a dedicated parser/normalizer under the planned `packages/io-formats/csi/` (or an explicitly justified equivalent location); keep the CSI-specific grammar separate from `model-core`.
- Support, as found in verified fixtures: joints/nodes, frame topology, story/grid metadata where available, material properties, common rectangular/I frame sections, end restraints and releases, load patterns/cases/combinations, uniform and concentrated frame loads.
- Parse incrementally, preserve source identifiers where practical, produce a mapping report (source → NexFEM ID) and diagnostics for unsupported tables/fields.
- Normalize unit conversions, global/local axes, frame i/j orientation, handedness and sign conventions; document each conversion with test cases.
- Feed the canonical NexFEM schema and existing `checkModel` validation; expose a user-facing import result summary and never silently discard unsupported entities/loads.
- Add deterministic parser/normalizer unit tests and end-to-end import checks for every available fixture. Include round-trip structural invariants inside NexFEM (IDs, connectivity, units, loads), without falsely claiming CSI export works.

**Done when:** both `.e2k` and `.s2k` real fixtures import within the declared MVP support set, automated tests pass, and every out-of-scope construct is reported explicitly.

### M2 — Engineering benchmark and solver comparison

- Build a repeatable benchmark runner and reports (suggested paths: `tests/benchmarks/csi/`, `docs/validation/`). Store model manifest (CSI product/version, unit system, element formulation, load case, constraints), reference tables, NexFEM outputs, scripts, and provenance.
- Compare joint displacement components, support reactions, member end forces and frame-force diagrams/stations where conventions permit; compare total loads vs reactions and check local/global axis and end-sign mappings.
- Calculate **absolute and relative differences**, per metric and per case. Define numerical tolerances **explicitly for each benchmark**, with engineering justification; don't declare arbitrary universal percentage thresholds or adjust tolerances merely to make failing tests pass.
- Separate **parser mapping differences**, **modeling/assumption differences** (e.g. rigid diaphragm, shear deformation, shell load distribution), and **solver numerical errors**. Label unsupported cases as `not comparable`, not `passed`.
- Keep the analytic Rust solver benchmarks and add CSI-derived regression cases to CI. Publish a concise coverage matrix and discrepancy log.

**Done when:** repeatable comparison reports cover several small frame cases using **independent actual CSI results**, identify the supported feature envelope and show no unexplained discrepancies inside documented tolerances. M2 may start in parallel with M1 using manual fixture-to-NexFEM construction, but final sign-off must exercise the import pipeline.

### M3 — Expand file interoperability (after M1/M2)

- Add broader text table support based on documented user demand and fixture availability; prioritize unsupported diagnostics over fragile guesses.
- Only after import and reference comparisons stabilize, implement `.e2k`/`.s2k` **export** with CSI-side re-import/round-trip checks where available.
- Do not assume proprietary `.edb` or `.sdb` binary file access; these formats are not part of Text Import MVP.

### M4 — CSI OAPI bridge (deferred)

- After M1/M2 acceptance, revisit `bridge/csi/` design (C#/.NET), version compatibility, Windows/CSI license requirements, attach/open/pull/push/run/getResults and sidecar security.
- Implement and test live calls only on machines with the requisite installed/licensed CSI products. Do not mix OAPI dependencies into a parser that should work offline.

## Suggested small PR breakdown

1. Fixtures manifest + explicit support matrix + parser scaffold and diagnostic contract.
2. ETABS `.e2k` import with fixture-based tests.
3. SAP2000 `.s2k` import with fixture-based tests.
4. Benchmark runner, exported CSI reference tables, tolerances and discrepancy reports.
5. App-level import UI / CI regression integration; resolve gaps and document supported envelope.
6. Later: export and OAPI as separately reviewed milestones.

## Reporting requirements

For each PR, record: verified input program/version; sample file provenance; supported and unsupported tables; mapping assumptions; checks run; benchmark outputs with tolerances; known limitations; follow-up issues. Avoid describing any part as ETABS/SAP2000-compatible until the applicable real-file tests and comparisons have passed.

**Source context:** `docs/ROADMAP.md`, `docs/adr/0002-csi-interop.md`, `docs/ux-round2.md` on the development branch. This decision document is maintained on `main`.

## Fixture availability update — 2026-11-10

One **real ETABS 23.2.0 `.e2k`** and a related `.$et` variant have now been received as ChatGPT conversation attachments, along with ETABS native binary files and an image. **They have not been uploaded to this public repository.** See [ETABS sample intake](ETABS_SAMPLE_INTAKE_2026-11-10.md) for verified format and record counts, temperature-unit normalization tests, and parser risk notes. SAP2000 `.s2k` and independent CSI analysis-result exports remain pending. Accordingly M0 is **ETABS partially unblocked, overall incomplete**; M2 CSI numerical comparison is still blocked. Do not push the raw engineering models to public GitHub without the owner's explicit authorization.

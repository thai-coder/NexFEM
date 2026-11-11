# Giai đoạn 5 · Nhóm A — stabilization & engineering validation

**Scope:** Repair reliability issues in the existing linear-static 3D frame solver and its UI execution. Phase 6 (deformed shape, diagrams, drift and export) remains explicitly **out of scope**.

## Implementation checklist

- [x] Reject loads with missing frame/shell/pattern IDs and load cases with missing patterns in TypeScript validation **and** Rust solver (API/WASM callers must also be safe).
- [x] Reject invalid frame section geometry and incompatible end releases.
- [x] Treat singular release condensation as an error; never silently return unreleased stiffness.
- [x] Calculate nested linear-add combinations independently of source ordering; reject invalid references and cycles.
- [x] Reject applied actions at numerically stabilized zero-stiffness rotational DOFs, instead of interpreting artificial stiffness as structural resistance.
- [x] Run WebAssembly solver in a dedicated Web Worker; lock before dispatch, reject overlapping F5, do not attach stale output after model reset, unlock on failure.
- [x] Retain dirty state for newly created but unsaved projects.
- [x] Add analytic and error-path Rust benchmarks, TypeScript validation regressions, browser E2E.
- [x] Add a **normalized result comparison harness** with strict per-metric tolerances and no invented ETABS values.
- [ ] All final commit CI jobs green, Windows smoke tests passed.
- [ ] Manual functional verification on an engineer's Windows workstation.
- [ ] Actual ETABS numerical comparisons: **blocked** until independent CSI result exports are supplied.

## Current supported analysis envelope

The solver provides **linear-static Euler–Bernoulli 3D frame** stiffness, standard joint restraints, supported end releases and member loads, self-weight and approximated slab/wall load transfer. It does **not** provide general shell stiffness, rigid diaphragms, end-offset zones, shear-deformable beam formulation, geometric nonlinearity/P-Delta, modal or response-spectrum response, or true CSI-wide numerical equivalence. The presence of a shell object in a file must never be treated as evidence that shell stiffness was modeled.

### Gate A: code and safety

Run `pnpm typecheck && pnpm test && pnpm build && pnpm e2e` and `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`; then build/install/uninstall both Windows distributions. In addition, explicitly exercise missing loads, invalid references, malformed sections, cyclic combinations, unstable releases, model reset while solving, save/open with unsaved changes, and pressing F5 repeatedly. A test reporting warnings does not count as successful structural validation if a load has been dropped.

### Gate B: analytic benchmarks

Rust tests in `crates/fem-solver/src/benchmarks.rs` cover: cantilever end force/deflection, simply supported uniformly loaded beam, fixed beam and released ends, axial/torsion, portal frame symmetry/equilibrium, unstable model detection, building gravity equilibrium and tributary areas. Group A adds regression cases for missing loads/patterns, nested combinations and cycles, invalid sections and singular release matrices. Keep tests executable in CI and evaluate each case with a documented, physically justified tolerance. Results from analytic solutions are **not** equivalent to an ETABS comparison.

### Gate C: ETABS comparison preparation — reference not yet available

- Owner-authorized **original ETABS 23.2.0 `.e2k`** fixture is stored on `main`: [ETABS text model](https://github.com/thai-coder/NexFEM/blob/main/tests/fixtures/csi/etabs/23217_SMFs%203D%20model_updated%20v4.e2k). See `tests/benchmarks/csi/manifest.json` for fixture provenance and missing reference artifacts.
- This fixture is a *model definition only*. Its diaphragm, area stiffness, springs, releases, load cases and other advanced features are not automatically comparable to NexFEM Solver v1. Do not run the full ETABS model through the simplified solver and label the difference a solver error.
- Request real ETABS exports: Joint Displacements, Joint Reactions and Frame Forces (with stations), with program version, analysis options, active unit system, load cases/combos and local axis conventions. Prefer a small, analytically tractable frame model alongside this complex full-building model.
- Map source joint/frame IDs, end i/j orientation, axes, units, loads, releases and modeling assumptions, and explicitly classify unsupported or non-comparable cases.
- Normalize reference and NexFEM metrics to identical units and IDs. Use `scripts/validation/compare-csi.mjs` for independently declared quantities, with explicit **per-metric** absolute/relative tolerances; do not adjust tolerances to force a pass.
- `node --test scripts/validation/compare-csi.test.mjs` tests the comparator with **synthetic data only**. It does *not* claim any CSI validation.

Normalized JSON inputs for the comparison tool follow this contract:

```json
{
  "source": {"program": "ETABS", "version": "23.2.0"},
  "units": {"force": "kN", "length": "m"},
  "metrics": [
    {
      "case": "DL", "kind": "displacement",
      "object": "J2", "component": "U3",
      "value": -0.01, "absTolerance": 0.0001, "relTolerance": 0.005
    }
  ]
}
```

The numbers above are **illustrative syntax**, not measured ETABS results or approved engineering tolerances. The observed NexFEM JSON has the same `units` and `metrics` shape with values; no tolerances are required on the observed side. Run:

```bash
node scripts/validation/compare-csi.mjs reference.json nexfem.json comparison-report.json
```

The runner fails if a metric is missing, unexpected or beyond its case-specific tolerance; it refuses a unit mismatch. Record any failed comparisons and classify parser/modeling-convention/solver discrepancies before treating them as actionable solver bugs.

## Windows manual sign-off

1. Launch desktop build and create a new project: close or Open must prompt when unsaved; Save then Open must retain geometry and load definitions.
2. Draw a simple supported frame, assign material/section/release/load; run F5 and check log, reactions and warnings.
3. While solving a sufficiently large case, repeat F5 and attempt edits/F6; only one analysis should run and the model must remain protected. Confirm UI stays responsive (Web Worker).
4. F6 unlocks a completed analysis and clears its result; a failed solve unlocks without leaving a false success.
5. Inspect output for unsupported shell mechanics or skipped non-static cases. Do not equate a pass with ETABS equivalence.

**Sign-off policy:** Group A remains **in review** until final CI passes and the manual Windows checklist is verified. ETABS numerical comparison is a separate, explicitly blocked acceptance gate until authentic result exports exist. Phase 6 remains unstarted.

# Giai đoạn 5 — Nhóm B: Solver nâng cao (review candidate)

Branch: claude/phase5-group-b-advanced-solver. Draft pull request: https://github.com/thai-coder/NexFEM/pull/2. Base: Phase 5 Group A. **Do not implement Phase 6.**

## Implemented

| Feature | Implementation | Boundaries |
|---|---|---|
| Timoshenko | Optional effective shear areas A2/A3 in frame section, analytical cantilever regression; default Euler-Bernoulli. | Shear areas require engineering justification; distributed load interpolation not independently CSI-verified. |
| Rigid end offsets | Axial rigid zones i/j, effective flexible span and consistent rigid-link stiffness, force, support moment transforms; Assign UI. | Only axial offsets (not full spatial eccentricities); member loads apply to flexible span, not rigid zones. |
| Rigid diaphragm | Horizontal master/slave MPC Ux, Uy, Rz with rigid rotation; reduced stiffness/loads, support reaction recovery; Assign UI and two-column analytic case. | All nodes must be coplanar at same Z and belong to frame members. No shell stiffness. Slave Ux/Uy/Rz supports prohibited. |
| Envelope | Per-component MAX/MIN reported separately. | Extreme components are not simultaneous equilibrium states; no combined load balance. |
| SRSS | Square-root-of-sum-of-squares of static case components. | Not modal or response-spectrum analysis; sign/concurrency is not preserved. |
| Sparse solver | CSR/Jacobi PCG selected above 2M estimated skyline entries. Explicit failure if nonconvergent. | Experimental; not proven on 100,000+ member model. It is NOT sparse-direct Cholesky. |

The model schema remains version 1 and new fields are optional for backward compatibility. Unsupported absAdd remains flagged; nonlinear results may not be combined again. The existing shell load transfer approximation is not a shell FEM stiffness model.

## Validation status

- [x] Source changes and Rust analytic tests.
- [x] TypeScript command, schema and model-validation tests.
- [x] Playwright Assign UI tests.
- [ ] Final commit: Rust fmt, clippy, tests; frontend typecheck, tests, build, E2E; Windows MSI/NSIS build and install/uninstall CI all green.
- [ ] Engineering signoff using Windows installer: create/modify/save/reopen/analyze with shear, offsets and diaphragm.
- [ ] Real 100k+ model sparse benchmark: peak RAM, elapsed time and convergence recorded; numerical parity with trusted reference.
- [ ] Independent ETABS/SAP2000 numerical comparisons. Real ETABS 23.2.0 E2K fixture is on main, but **no CSI displacement/reaction/frame-force result tables** are available.

## Engineering approval gates

Verify existing Phase 5A benchmarks remain unchanged for models without advanced settings. Verify rigid-link support moments, constrained diaphragm rotations, reactions and compound releases with independent analytic answers. For Envelope/SRSS, never report a componentwise extreme as a simultaneous load state. Validate the sparse iterative solver for ill-conditioned problems and reject on nonconvergence. Perform manual Windows functional signoff; do not equate automated CI with structural certification.

**Phase 6 remains out of scope. Group B PR must not be merged automatically.**

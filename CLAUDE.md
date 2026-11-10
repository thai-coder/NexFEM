# NexFEM — Instructions for Claude

## Owner-approved decision — 2026-11-09

**Prioritize CSI Text Import (.e2k for ETABS; .s2k for SAP2000) and a reproducible ETABS/SAP2000 benchmark/validation suite BEFORE developing the live CSI OAPI bridge.**

This instruction is a **priority change**, not a claim that CSI import, benchmark comparison, or OAPI already works. The agreed scope and acceptance criteria are in [docs/CSI_IMPORT_VALIDATION_PLAN.md](docs/CSI_IMPORT_VALIDATION_PLAN.md). Read that document before planning or implementing CSI work.

## Repository context

- `main` is currently sparse (README/license and decision docs), not the application source branch.
- Application code, CI, current roadmap, and ADRs are on `claude/etab-sap2000-connection-vts58p`.
- Existing design: `docs/ROADMAP.md`, `docs/adr/0002-csi-interop.md`, `docs/ux-round2.md` on the application branch.
- **Do not start OAPI development while the import and benchmark milestones are unfulfilled**, unless the owner explicitly changes the priority.
- Make implementation changes on a development branch and use a PR/review before merging application code into `main`. Do not bulk-merge the existing development branch merely because this instruction was added to `main`.

If working from an older development branch, **read the instructions from `main` explicitly**, because a new file on `main` will not automatically appear in the checked-out branch:

```bash
git fetch origin main
git show origin/main:CLAUDE.md
git show origin/main:docs/CSI_IMPORT_VALIDATION_PLAN.md
git show origin/main:docs/ETABS_SAMPLE_INTAKE_2026-11-10.md
# Read the original fixture directly from main (quote the path containing spaces):
git show "origin/main:tests/fixtures/csi/etabs/23217_SMFs 3D model_updated v4.e2k" > /tmp/nexfem-etabs-reference.e2k
```

## Engineering guardrails

- Preserve the existing NexFEM model schema and validate units, coordinate systems, section axes, sign conventions, releases, restraints, and load cases when mapping CSI text files.
- Use real, version-identified ETABS/SAP2000 text exports as fixtures; do not invent parser syntax and declare it validated.
- Unsupported or ambiguous constructs must produce explicit diagnostics. No silent data loss or unjustified `success` flag.
- Compare solver outputs with independently exported CSI results (without requiring OAPI), alongside analytic benchmarks. Record tolerances and known solver limitations.
- The current Rust solver is a linear-static frame solver; do not present shell, diaphragm, P-Delta, dynamics, or design-code behavior as equivalent to ETABS/SAP2000 without implementing and validating it.
- CI success is not proof of engineering equivalence. Document validation coverage, gaps, and manual verification separately.

## ETABS sample received — 2026-11-10

A real ETABS 23.2.0 `.e2k` text model and related files have been inspected. Read [the fixture intake note](docs/ETABS_SAMPLE_INTAKE_2026-11-10.md) for counts, grammar/units risks, blocked benchmarks and privacy constraints. **The owner explicitly authorized publishing the original .e2k, and it is now present on GitHub `main`: [ETABS 23.2.0 fixture](https://github.com/thai-coder/NexFEM/blob/main/tests/fixtures/csi/etabs/23217_SMFs%203D%20model_updated%20v4.e2k).** Only this `.e2k` (not the other four attachments) was published. SAP2000 `.s2k` and exported ETABS analysis results remain pending.

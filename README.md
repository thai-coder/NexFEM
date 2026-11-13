# NexFEM
NexFEM Designer is an intuitive structural analysis FEA software you can master in minutes. The basic version is free for professional use with unlimited nodes and elements. It features streamlined modeling, clearly organized analysis results, and customizable structural verifications for all materials

## Decisions and guidance for Claude

**Approved priority (2026-11-09): CSI Text Import (.e2k/.s2k) and ETABS/SAP2000 reference benchmarks come before CSI OAPI.**

- [CLAUDE.md](CLAUDE.md) — instructions for Claude working on NexFEM.
- [Project status](PROJECT_STATUS.md) and [session handoff](docs/HANDOFF.md) — checkpoints for continuing work across ChatGPT, Codex, and Claude.
- [CSI Import & Validation implementation plan](docs/CSI_IMPORT_VALIDATION_PLAN.md) — agreed priority, scope, acceptance criteria and implementation checklist.
- [ETABS sample intake, 2026-11-10](docs/ETABS_SAMPLE_INTAKE_2026-11-10.md) — inventory and import notes for the first public ETABS fixture.
- [Original ETABS 23.2.0 `.e2k` test fixture](https://github.com/thai-coder/NexFEM/blob/main/tests/fixtures/csi/etabs/23217_SMFs%203D%20model_updated%20v4.e2k) — owner-authorized original model for developing the CSI text parser.

The `main` branch currently holds project entry-point documentation. Active application code and its existing roadmap are on `claude/etab-sap2000-connection-vts58p`; do not mistake the small `main` tree for the entire implementation.

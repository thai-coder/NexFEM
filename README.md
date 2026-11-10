# NexFEM
NexFEM Designer is an intuitive structural analysis FEA software you can master in minutes. The basic version is free for professional use with unlimited nodes and elements. It features streamlined modeling, clearly organized analysis results, and customizable structural verifications for all materials

## Decisions and guidance for Claude

**Approved priority (2026-11-09): CSI Text Import (.e2k/.s2k) and ETABS/SAP2000 reference benchmarks come before CSI OAPI.**

- [CLAUDE.md](CLAUDE.md) — instructions for Claude working on NexFEM.
- [CSI Import & Validation implementation plan](docs/CSI_IMPORT_VALIDATION_PLAN.md) — agreed priority, scope, acceptance criteria and implementation checklist.
- [ETABS sample intake, 2026-11-10](docs/ETABS_SAMPLE_INTAKE_2026-11-10.md) — metadata from the first real ETABS text export; the original model files are not published.

The `main` branch currently holds project entry-point documentation. Active application code and its existing roadmap are on `claude/etab-sap2000-connection-vts58p`; do not mistake the small `main` tree for the entire implementation.

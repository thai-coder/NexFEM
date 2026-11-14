# Checkpoint: CSI text import (M1: ETABS `.e2k` and SAP2000 `.s2k`)

- **Updated / time zone:** 14/11/2026 (UTC).
- **Repo / task / owner:** `thai-coder/NexFEM` / CSI Text Import MVP / Claude.
- **Status:** `REVIEW`. Both importers have been tested on real files. M2 is blocked: there are still no ETABS/SAP2000 result tables to compare against.
- **Branch:** the application branch `claude/etab-sap2000-connection-vts58p`.
- **Done:**
  - Package `@nexfem/io-formats` contains the `.e2k` importer (ETABS 23.2.0) and the `.s2k` / `.$2k` importer (SAP2000 23.1.0 and 25.3.1), plus `.sdb` binary detection.
  - File ▸ **Import file** is a submenu with one entry per format: ETABS, SAP2000, and DXF/IFC/Excel (phase 8).
  - The import report dialog is shared by both importers.
  - The 3 real SAP2000 files are kept byte-for-byte in `tests/fixtures/csi/sap2000/` with a README.
  - Documentation: `docs/csi-import.md`.
- **Local tests:** typecheck; io-formats (43), desktop i18n; Playwright e2k-import (8 tests, 5 of them new for SAP2000 and the submenu).
- **First action when resuming:** read "Next steps" in `docs/csi-import.md`.
  - First priority: frame local-axis angle. The two columns of `24061_OMF.s2k` are rotated 90°, and ETABS frames use `ANG`.
  - Next: joint loads (schema and solver, coordinate with Codex).
- **M1 completion condition:** the user imports other ETABS/SAP2000 files and confirms the mapping assumptions (DZ, PINNED, partial fixity, None area).

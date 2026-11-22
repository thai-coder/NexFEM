# ChatGPT kickoff for NexFEM

ChatGPT conversations cannot read the repository. The owner pastes everything below the line at the start of each new conversation. This file is a copy of [docs/TEAM_CONVENTIONS.md](TEAM_CONVENTIONS.md): update both files together.

---

You are working on NexFEM (GitHub `thai-coder/NexFEM`), a structural FEA desktop app. Several models share the work: Claude, Codex and ChatGPT. Follow these team conventions.

1. **End every turn with exactly one line:**
   `[UTC yyyy-mm-dd hh:mm] Đã làm: <what was done> | Việc kế tiếp: <one concrete next task> | Ai làm: <Owner | Claude Opus/Sonnet/Haiku | Codex | ChatGPT>`
2. **Source of truth:** GitHub issues and PRs. Each task has one file, `docs/checkpoints/<branch-name-with-dashes>.md`, edited only by its owner. `PROJECT_STATUS.md` is a generated index; never edit it by hand. If you cannot read the repository, ask the owner to paste the relevant task file or PR text. Do not guess the current state.
3. **Merging:** merge only when the owner explicitly says to merge that PR. Do not delete a task file before its PR is merged.
4. **POLICY-001:** do not build the desktop app or installers, and do not publish releases or tags. The existing CI pipeline is not affected.
5. **Language:** reply to the owner in Vietnamese. Anything meant for the repository (code, commit messages, PR text, documentation) is written in English.
6. **Model guidance:** Opus for hard code (solver, schema, CSI import); Sonnet for small fixes and review; Haiku for look-ups. High-risk work is reviewed by a different model from its author.
7. **Engineering guardrails:** CSI text import (`.e2k`, `.s2k`) and benchmarks against independently exported ETABS/SAP2000 results come before the CSI OAPI bridge. The solver is linear-static frame only. Do not present shell, diaphragm, P-Delta, dynamics or design-code behaviour as equivalent to ETABS/SAP2000. Unsupported input must produce explicit diagnostics, never silent data loss.

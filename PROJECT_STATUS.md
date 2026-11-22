# NexFEM — Chỉ mục checkpoint

<!-- File sinh tự động bởi scripts/checkpoint_index.py. Không sửa tay. -->

Mỗi nhiệm vụ có một file checkpoint riêng trong [docs/checkpoints/](docs/checkpoints/README.md). Đọc bảng này, rồi mở đúng file của nhiệm vụ cần tiếp tục và đối chiếu với nhánh, PR và CI. Quy trình: [docs/HANDOFF.md](docs/HANDOFF.md).

Nếu file này xung đột khi merge hoặc rebase: chạy `python3 scripts/checkpoint_index.py` rồi stage lại.

**Checkpoint cập nhật gần nhất:** [ccr-fe043ef3-476w55](docs/checkpoints/ccr-fe043ef3-476w55.md) — REVIEW — Claude, phiên https://claude.ai/code/session_01N2LX7zjZmkJJoLDnGggBvb — 2026-11-22 04:24 UTC.

## Việc tiếp theo và giao cho ai

- **Chủ dự án** — Review và merge PR #23 vào main; sau đó nhắc Codex thêm phần đầu file cho docs/checkpoints/codex-sap-platform-m2.md và trailer Agent/Agent-Session ([ccr-fe043ef3-476w55](docs/checkpoints/ccr-fe043ef3-476w55.md), REVIEW, cập nhật 2026-11-22 04:24 UTC)
- **Codex (mô hình mạnh nhất, High)** — Review độc lập PR #19 (nhập CSI và bộ giải, vùng nguy cơ cao), rồi chủ dự án merge ([claude-festive-ritchie-e8hzpu](docs/checkpoints/claude-festive-ritchie-e8hzpu.md), REVIEW, cập nhật 2026-11-21)
- **Chủ dự án** — PR #19 đã chứa toàn bộ PR #21 (e0799a8): merge #19 rồi đóng #21, hoặc merge #21 trước ([codex-sap-critical-load-warnings](docs/checkpoints/codex-sap-critical-load-warnings.md), REVIEW, cập nhật 2026-11-21)
- **Claude (tầm trung)** — Review PR #20 (Help và tài liệu, giao diện) rồi merge ([codex-csi-help-and-analysis-modes](docs/checkpoints/codex-csi-help-and-analysis-modes.md), REVIEW, cập nhật 2026-11-16)
- **Chủ dự án** — Nghiệm thu trên Windows: nhập .e2k/.s2k, góc xoay trục, tải nút ([csi-import-local-axes-joint-loads](docs/checkpoints/csi-import-local-axes-joint-loads.md), REVIEW, cập nhật 2026-11-14)

## Tất cả nhiệm vụ

Chỉ mục chỉ thấy checkpoint đã vào `main`. Để biết phiên nào đẩy commit gần nhất trên mọi nhánh, chạy `python3 scripts/checkpoint_index.py --latest`.

| Nhiệm vụ | Trạng thái | Người làm | Nhánh | PR | Cập nhật | Tóm tắt |
|---|---|---|---|---|---|---|
| [ccr-fe043ef3-476w55](docs/checkpoints/ccr-fe043ef3-476w55.md) | REVIEW | Claude | `ccr-fe043ef3-476w55` | [#23](https://github.com/thai-coder/NexFEM/pull/23) | 2026-11-22 04:24 UTC | Checkpoint theo nhiệm vụ, chỉ mục sinh tự động, nhận diện phiên và giao việc |
| [claude-festive-ritchie-e8hzpu](docs/checkpoints/claude-festive-ritchie-e8hzpu.md) | REVIEW | Claude | `claude/festive-ritchie-e8hzpu` | [#19](https://github.com/thai-coder/NexFEM/pull/19) | 2026-11-21 | Benchmark giải tích SAP2000 → bộ giải; sửa review PR #21; tải thanh hình thang |
| [codex-sap-critical-load-warnings](docs/checkpoints/codex-sap-critical-load-warnings.md) | REVIEW | Codex | `codex/sap-critical-load-warnings` | [#21](https://github.com/thai-coder/NexFEM/pull/21) | 2026-11-21 | Cảnh báo và chặn nhập mô hình CSI khi thiếu tải phân tích |
| [codex-csi-help-and-analysis-modes](docs/checkpoints/codex-csi-help-and-analysis-modes.md) | REVIEW | Codex | `codex/csi-help-and-analysis-modes` | [#20](https://github.com/thai-coder/NexFEM/pull/20) | 2026-11-16 | Thêm Help và mục lục tài liệu ETABS/SAP2000 |
| [csi-import-local-axes-joint-loads](docs/checkpoints/csi-import-local-axes-joint-loads.md) | REVIEW | Claude | `claude/etab-sap2000-connection-vts58p` |  | 2026-11-14 | Nhập file CSI, góc xoay trục, tải nút |
| [merge-pr16-pr18-pr17](docs/checkpoints/merge-pr16-pr18-pr17.md) | DONE | Claude | `claude/etab-sap2000-connection-vts58p` |  | 2026-11-16 | Merge #16, #18, #17 vào nhánh ứng dụng; chờ nghiệm thu Windows |
| [pr16-pr17-fixes](docs/checkpoints/pr16-pr17-fixes.md) | DONE | Codex | `claude/footing-interior-nodes` |  | 2026-11-15 | PR #16 sửa chia tấm và PR #17 đóng mô hình |
| [review-pr16-footing-split](docs/checkpoints/review-pr16-footing-split.md) | DONE | Codex | `claude/footing-interior-nodes` | [#16](https://github.com/thai-coder/NexFEM/pull/16) | 2026-11-15 | Review PR #16: chia tấm tại nút để quy lò xo nền |
| [integration-5a-6-3](docs/checkpoints/integration-5a-6-3.md) | DONE | Codex | `claude/etab-sap2000-connection-vts58p` | [#9](https://github.com/thai-coder/NexFEM/pull/9) | 2026-11-13 | Tích hợp 5A–6.3 để Claude tiếp tục |
| [phase6-3-m3](docs/checkpoints/phase6-3-m3.md) | DONE | Codex | `codex/phase6-3-m3` | [#6](https://github.com/thai-coder/NexFEM/pull/6) | 2026-11-13 | 6.3 Biểu đồ M3 và chạy biến dạng tĩnh (trước tích hợp) |

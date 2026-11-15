# Phân việc giữa các tác tử AI (Claude, Codex/GPT) và chủ dự án

Cập nhật 15/11/2026. Bổ sung cho [quy trình bàn giao](HANDOFF.md) (trên `main`): bàn giao nói **làm tiếp thế nào**, tài liệu này nói **ai làm việc gì, bằng mô hình nào, ai kiểm tra**.

## Nguyên tắc

1. **Mô hình theo rủi ro, không theo độ dài.** Việc mà sai âm thầm cho ra kết quả kỹ thuật sai (bộ giải, schema, ánh xạ nhập CSI) dùng mô hình mạnh nhất. Việc làm theo mẫu có sẵn và có test bao quanh dùng mô hình tầm trung. Việc cơ học dùng mô hình nhẹ.
2. **Người viết không phải người duy nhất kiểm tra.** Thay đổi ở vùng nguy cơ cao cần tác tử *khác* (hoặc chủ dự án) review trước khi coi là xong. Hai mô hình khác nhau bắt được những lỗi khác nhau.
3. **Một người viết cho mỗi hợp đồng dữ liệu.** Chỉ một PR đang mở được sửa schema (`schema.ts`, `model.rs`, `model.schema.json`, mẫu sinh tự động) tại một thời điểm.
4. **CI xanh không phải bằng chứng tương đương kỹ thuật.** Phần kiểm chứng riêng (benchmark, đối chiếu CSI, nghiệm thu Windows) ghi tách khỏi CI, như `CLAUDE.md` đã yêu cầu.
5. **Không đoán điều thuộc về chủ dự án** (xem mục "Chủ dự án quyết định").

## Bảng định tuyến

Nguồn dữ liệu: [`scripts/route/routing.json`](../scripts/route/routing.json). Gợi ý tự động theo file thay đổi, bằng `node scripts/route/route.mjs <file>...`.

| Vùng | Nguy cơ | Mô hình gợi ý | Review chéo | Ghi chú |
| --- | --- | --- | --- | --- |
| Hợp đồng dữ liệu: `schema.ts`, `model.rs`, `model.schema.json`, `resources/templates/` | cao | mạnh nhất | **cần** | khoá: một PR một lúc; luôn tương thích ngược |
| Bộ giải `crates/fem-solver`, `fem-wasm` | cao | mạnh nhất | **cần** | mỗi thay đổi kèm benchmark có đáp án giải tích |
| Nhập CSI `packages/io-formats`, fixture, `scripts/validation` | cao | mạnh nhất | **cần** | không đoán cú pháp; file thật có phiên bản |
| Lõi mô hình, lệnh `packages/model-core` | vừa | tầm trung | nên | |
| Khung nhìn `packages/viewer` | vừa | tầm trung | nên | |
| Giao diện `apps/desktop` | vừa | tầm trung | nên | theo mẫu dialog/panel có sẵn |
| Bộ cài, CI, `src-tauri`, phiên bản | vừa | tầm trung | nên | **cần nghiệm thu Windows** của chủ dự án |
| Chuỗi giao diện, e2e, tài liệu | thấp | nhẹ hoặc tầm trung | không | |
| Thay đổi chạm từ hai vùng cao trở lên, hoặc schema kèm vùng khác | cao | mạnh nhất, mức suy nghĩ cao | **cần** | tách thành PR nhỏ nếu được |

Việc **nhẹ, lặp lại** nên giao cho phiên rẻ nhất, không giữ trong phiên chính: kiểm tra CI của một lần đẩy, xác nhận bản phát hành, chạy lại kiểm thử, cập nhật số liệu trong checkpoint. Các lần "kiểm tra CI" hẹn giờ trong phiên làm việc là loại này.

## Phân công đề xuất cho Claude và cho Codex

Đây là đề xuất theo lịch sử nhánh: Codex làm Giai đoạn 6 (chọn case kết quả, hình biến dạng, biểu đồ mô men M3/M2) và tích hợp 5A–6.3 vào nhánh ứng dụng; Claude làm bộ giải 5A/5B, nhập CSI, thư viện thép, độ chính xác tiết diện, Mô hình mới, bộ cài. Tôi **không biết** hạn mức hay năng lực chính xác của Codex ở thời điểm này, nên chủ dự án điều chỉnh theo thực tế.

| Loại việc | Giao cho | Vì sao |
| --- | --- | --- |
| Nhập CSI (`.e2k`, `.s2k`), ánh xạ, báo cáo nhập | Claude | đang nắm ngữ cảnh và các giả định đã chốt |
| Phần tử shell cho sàn/vách (Giai đoạn 9) | Codex viết, Claude review | module lớn, tách biệt, kiểm chứng được bằng bài toán giải tích; review độc lập |
| Bộ nhập DXF, IFC, Excel (Giai đoạn 8) | Codex | package mới, không đụng schema, đặc tả rõ |
| Chia sàn/móng tại nút nằm bên trong | Claude viết, Codex review | nối bộ nhập và bộ giải |
| Review thay đổi bộ giải hoặc schema do Claude viết | Codex | độc lập |
| Review thay đổi nhập CSI hoặc schema do Codex viết | Claude | độc lập |
| Nghiệm thu thao tác trên Windows | **chủ dự án** | không tác tử nào làm thay |
| Đối chiếu kết quả (M2) | chủ dự án cung cấp dữ liệu, tác tử nào rảnh viết công cụ | bị chặn bởi bảng kết quả xuất từ ETABS/SAP2000 |

## Tự động hoá đã có

- `scripts/route/route.mjs` (có test, chạy trong CI): từ danh sách file → vùng, nguy cơ, mô hình gợi ý, cần review chéo, khoá schema, cần nghiệm thu Windows.
- `.github/workflows/route.yml`: mỗi pull request tự ghi **gợi ý vào Job Summary** và liệt kê **PR đang mở đụng cùng file hoặc cùng schema**. Chỉ ghi summary; không bình luận, không gắn nhãn, không chặn merge. Cần chủ dự án bật nếu muốn nhãn hoặc bình luận (xem dưới).
- CI hiện có: typecheck, test, Playwright, Rust (fmt, clippy, test), cài/gỡ MSI và NSIS, phiên bản tự tính, phát hành bản thử.
- Checkpoint theo [HANDOFF.md](HANDOFF.md); `PROJECT_STATUS.md` là điểm vào duy nhất.

## Chưa tự động hoá được (và vì sao)

- **Gọi Codex hoặc đổi mô hình từ phiên này.** Phiên Claude không có công cụ giao việc cho Codex; chủ dự án (hoặc một bước trong ChatGPT/Codex) giao theo bảng trên. Việc này cần một đường giao việc do chủ dự án thiết lập, ví dụ issue có nhãn `agent:codex`.
- **Tự chọn mức suy nghĩ.** Gợi ý của `route.mjs` là khuyến nghị; người giao việc quyết định.
- **Nghiệm thu Windows.** Bắt buộc có người.

## Việc cần chủ dự án quyết

1. **Bật nhãn và bình luận tự động?** Mặc định tắt vì mỗi bình luận làm phiền người liên quan. Nếu bật: nhãn `route:deep|standard|light`, `needs:cross-review`, `needs:windows`, `schema-lock` trên PR.
2. **Đường giao việc cho Codex:** dùng issue với nhãn `agent:codex` / `agent:claude`, hay giao tay mỗi lần?
3. **Cho phép review chéo chặn merge?** Hiện chỉ cảnh báo. Có thể đặt branch protection yêu cầu một review cho PR chạm vùng nguy cơ cao.
4. **Chấp nhận giả định kỹ thuật** (do tác tử đề xuất, chưa kiểm chứng với CSI): `RELEASE "PINNED"` nhả M2 và M3; cao độ nút = cao độ tầng − DZ; ổn định hoá cơ cấu bằng độ cứng nhỏ; quy lò xo về nút; trục hình học của thép góc.
5. **Thay đổi ưu tiên** (ví dụ chuyển sang cầu nối OAPI, Giai đoạn 8, 9): theo `CLAUDE.md`, không bắt đầu OAPI khi chưa xong nhập CSI và đối chiếu.
6. **Ghi vào `main`:** `CLAUDE.md` và `AGENTS.md` nằm ở `main`; thêm liên kết tới tài liệu này cần chủ dự án đồng ý.
7. **Xuất bản dữ liệu** (fixture): chỉ tệp chủ dự án đã cho phép.

## Chi phí và hạn mức

Trong các phiên gần đây chạm giới hạn sử dụng hai lần; quy trình bàn giao đã khôi phục được cả hai lần mà không mất mã. Để giảm chạm giới hạn: giao việc nhẹ cho mô hình nhẹ, không để phiên chính chờ CI (dùng kiểm tra hẹn giờ), và dùng mô hình mạnh chỉ cho vùng nguy cơ cao theo bảng trên.

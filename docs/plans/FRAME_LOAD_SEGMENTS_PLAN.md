# Kế hoạch: tải phân bố từng đoạn và hình thang trên thanh (`FrameLoad`)

**Trạng thái:** ĐÃ CHỐT D1–D3 và yêu cầu R1 (21/11/2026). PR A: mã xong, **chờ review chéo** (Claude, nhánh `claude/festive-ritchie-e8hzpu`; xem checkpoint cuối tài liệu).
**Nơi điều phối chung:** [issue #22](https://github.com/thai-coder/NexFEM/issues/22). Mọi tác tử AI nhận việc, báo tiến độ và hỏi ở issue đó; tài liệu này là đặc tả.
**Cập nhật:** 21/11/2026 (UTC+7).

## 1. Vì sao

NexFEM hiện chỉ có tải phân bố **đều trên cả chiều dài thanh** (`kind: "distributed"`) và tải tập trung. ETABS/SAP2000 có tải hình thang (`LINELOAD TRAPF`, `FRAME LOADS - DISTRIBUTED` với `FOverLA ≠ FOverLB`) và tải trên một đoạn (`RDSTART/RDEND`, `RelDistA/RelDistB`).

Trước đây bộ nhập đổi các tải này thành tải đều cả nhịp, giữ hợp lực nhưng sai vị trí: với dầm công xôn 6 m, tải 10 kN/m trên nửa ngoài, mômen ngàm tính tay là 135 kN·m nhưng mô hình nhập cho 90 kN·m (−33%). Từ commit `b7c5c80` (nhánh `claude/festive-ritchie-e8hzpu`), các tải này là lỗi `line_load_not_uniform` và chặn mở mô hình. File ETABS 23.2.0 thật trong repo bị chặn vì 9 tải như vậy.

Mục tiêu: biểu diễn **chính xác** tải phân bố tuyến tính trên đoạn `[a, b]` của thanh, từ schema đến bộ giải, bộ nhập và giao diện, để mở được mô hình mà không mất hoặc dời tải.

## 2. Hiện trạng mã (đã đọc, 21/11/2026)

| Lớp | Vị trí | Hiện trạng |
| --- | --- | --- |
| Schema TS | `packages/model-core/src/schema.ts` `FrameLoadSchema` | `kind: "distributed" \| "point"`, `value`, `at?` (0..1, chỉ cho tải tập trung) |
| Schema Rust | `crates/fem-core/src/model.rs` `FrameLoad` | `kind: String`. **Rủi ro:** bộ giải coi mọi `kind` khác `"point"` là tải đều |
| Bộ giải | `crates/fem-solver/src/analysis.rs` `MemberLoad::{Uniform, Point}`; `element.rs` `uniform_feq`, `point_feq`; `stations()` tính nội lực dọc thanh | phải thêm loại tải mới ở cả ba chỗ; ngưng tụ nhả liên kết (`condense`) dùng `feq` chung nên không phải sửa |
| Offset đầu thanh | `analysis.rs` dòng ~553: `l = full_length − start − end`; tải tập trung đặt ở `at · e.l` | vị trí tương đối đang tính theo **chiều dài mềm**, trong khi CSI tính theo chiều dài nút–nút (xem quyết định D2) |
| Chia thanh khi nhập | `packages/io-formats/src/csi/locate.ts` `remapFrameLoads` | tải phân bố chép nguyên cường độ sang mọi đoạn. Với tải từng đoạn/hình thang phải cắt `[a, b]` theo từng đoạn và nội suy |
| Bộ nhập | `s2k-import.ts` (FRAME LOADS - DISTRIBUTED), `e2k-import.ts` (LINELOAD TRAPF) | hiện báo `line_load_not_uniform` |
| Kiểm tra mô hình | `packages/model-core/src/validation.ts`; kiểm tra phía Rust trong `analysis.rs` dòng ~278 | thêm ràng buộc cho loại mới |
| Giao diện | `apps/desktop/src/dialogs/AssignDialogs.tsx`, `panels/properties/Properties.tsx`, `packages/viewer/src/viewer.ts` (vẽ tải), `packages/model-core/src/reports.ts`, `assign.ts`, `commands.ts`, i18n | thêm lựa chọn, nhập liệu và hình vẽ |
| Truyền tải sàn | `analysis.rs` (tải sàn → thanh biên theo quy tắc 45°, dưới dạng tải đều tương đương) | **ngoài phạm vi** (xem mục 7) |

## 3. Quyết định của chủ dự án

**Đã chốt 21/11/2026:** đồng ý D1, D2, D3 như đề xuất dưới đây. Về `schemaVersion`: **giữ 1**. Thay đổi chỉ thêm (file cũ vẫn mở được, không cần chuyển đổi); bản cũ gặp `kind: "linear"` sẽ từ chối file vì giá trị enum lạ, không đọc sai. Tăng lên 2 thì mọi file cũ phải qua bước chuyển đổi mà không được gì thêm.

**R1 (yêu cầu của chủ dự án): tải gắn theo thanh.** Tải lưu theo `frame` (id thanh) và vị trí **tương đối** (`start`, `end`, `at`), nên:
- dời nút (`joint.move`) hoặc kéo dài thanh: tải đi theo, giữ vị trí tương đối (như `RelDist` của CSI; vị trí tuyệt đối đổi theo chiều dài mới);
- sao chép/nhân bản (`replicate`: tịnh tiến, đối xứng, sang tầng) với tuỳ chọn sao chép tải: tải `linear` được chép đủ trường; với đối xứng, đầu i/j của thanh mới là ảnh của i/j cũ nên vị trí tương đối giữ nguyên;
- lệnh dời/chia thanh trong tương lai (chưa có): dời phải giữ tải; chia phải cắt tải theo đoạn (dùng chung hàm cắt với bộ nhập, đặt trong `model-core`, không trong `io-formats`);
- xoá thanh: xoá tải của nó (đã có).
Mỗi điểm trên có test trong PR A (lệnh) hoặc PR C (giao diện).

Đề xuất ban đầu:

**D1. Hình dạng schema.** Đề xuất: thêm `kind: "linear"` với `start`, `end` (tương đối 0..1, `start < end`), `value` (cường độ tại `start`) và `valueEnd` (cường độ tại `end`). Giữ `distributed` như cũ.
- Vì sao không thêm trường tuỳ chọn vào `distributed`: bản NexFEM cũ đọc file mới sẽ bỏ qua trường lạ và **âm thầm** coi là tải đều cả nhịp. Với `kind` mới, schema zod cũ từ chối file nên lỗi lộ ra.
- Kèm theo: phía Rust phải từ chối `kind` lạ (hiện đang coi là tải đều). Có tăng `schemaVersion` hay không: chủ dự án quyết định.

**D2. Gốc của vị trí tương đối khi thanh có offset đầu (vùng cứng).** CSI đo `RelDist` theo chiều dài nút–nút; bộ giải NexFEM đặt tải tập trung theo chiều dài mềm. Đề xuất: định nghĩa `start/end/at` theo **chiều dài nút–nút**, như CSI. Phần tải nằm trong vùng cứng truyền thẳng về nút qua offset cứng. Điều này cũng sửa luôn cách hiểu `at` của tải tập trung hiện có trên thanh có offset; nếu chọn vậy phải làm thành mục riêng, có benchmark, và ghi rõ thay đổi kết quả của mô hình cũ.

**D3. Giao diện.** Đề xuất: hộp thoại Gán tải thanh có thêm "Hình thang / từng đoạn" với 4 ô (`start`, `end`, `value`, `valueEnd`), cho nhập theo tương đối hoặc tuyệt đối (m). Vẽ hình thang trên khung nhìn.

## 4. Chia việc thành PR (mỗi PR một người viết, một người review khác)

Theo `docs/WORK_ROUTING.md`: schema và bộ giải là vùng nguy cơ cao (mô hình mạnh nhất, cần review chéo), và **chỉ một PR sửa schema tại một thời điểm**.

| PR | Phạm vi | Phụ thuộc | Nguy cơ | Xong khi |
| --- | --- | --- | --- | --- |
| **A. Schema + bộ giải** | R1 cho các lệnh hiện có (dời nút, nhân bản, xoá) + hàm cắt tải theo đoạn trong `model-core`; `schema.ts`, `model.schema.json` sinh lại, `model.rs` (từ chối `kind` lạ), `validation.ts` + kiểm tra Rust, `MemberLoad::Linear`, FEF, `stations()`, benchmark giải tích | D1, D2 | cao | mọi benchmark ở mục 5 đạt với sai số làm tròn; `cargo test`, `pnpm test` xanh; review chéo |
| **B. Bộ nhập CSI** | `s2k-import.ts`, `e2k-import.ts` tạo `linear`; `remapFrameLoads` cắt theo đoạn; bỏ lỗi `line_load_not_uniform` cho dạng đã hỗ trợ; nhiều bản ghi TRAPF nối tiếp trên một thanh | A đã merge | cao | test fixture: tổng lực và mômen tĩnh của tải nhập trùng với nguồn; file ETABS thật mở được không cần biến thể dẫn xuất; e2e mở + F5 |
| **C. Giao diện** | Gán tải, Properties, vẽ hình thang, báo cáo, lệnh + Undo, i18n, e2e | A đã merge (có thể song song với B) | vừa | e2e gán, sửa, Undo, vẽ và giải một tải hình thang |
| **D. (tuỳ chọn) Offset đầu thanh** | sửa gốc vị trí tải khi có vùng cứng, nếu D2 chọn chiều dài nút–nút | A | cao | benchmark thanh có offset; ghi thay đổi kết quả |

Thứ tự: A → (B ∥ C) → D. Không gộp A với B hay C.

## 5. Benchmark bắt buộc cho PR A (đáp án giải tích, kN·m)

Mỗi ca kiểm tra chuyển vị nút, phản lực, nội lực tại trạm và cân bằng tổng; dung sai tương đối khoảng 1e-9, vì nghiệm đúng cho phần tử Euler–Bernoulli với tải đa thức bậc 1.

1. Công xôn, tải tam giác 0 → w (tăng về đầu tự do): độ võng đầu = 11wL⁴/120EI, M ngàm = −wL²/3. Đổi chiều tam giác (w → 0): δ = wL⁴/30EI, M = −wL²/6.
2. Công xôn, tải đều trên đoạn [L/2, L] (ca 135 → 90 kN·m ở mục 1): M ngàm = −w(L/2)(3L/4).
3. Dầm đơn giản, tải đều trên đoạn [a, b]: phản lực và M(x) theo tĩnh học.
4. Dầm hai đầu ngàm, tải hình thang toàn nhịp: FEF theo công thức đóng (tổng của tải đều và tải tam giác).
5. Tải `linear` với `value = valueEnd`, `start = 0`, `end = 1` cho kết quả **trùng** `distributed` (so từng số).
6. Thanh có nhả mômen ở một đầu, chịu tải hình thang (kiểm tra ngưng tụ).
7. Tải theo các phương `gravity`, `globalX`, `local2`, `local3` trên thanh xiên và thanh có góc xoay.
8. Một thanh chia thành hai đoạn, tải cắt theo đoạn, cho kết quả trùng thanh liền (kiểm tra cho PR B, đặt sẵn ở đây).
9. Tổ hợp có hệ số: kết quả tuyến tính theo hệ số.

Thêm ca vào `tests/benchmarks/csi/generate-cases.mjs` khi PR B có đường nhập.

## 6. Cách tính (gợi ý cho PR A)

- FEF: tích phân hàm dạng Hermite (uốn) và tuyến tính (dọc trục, xoắn) nhân với tải tuyến tính trên `[a, b]`. Gauss–Legendre 3 điểm trên `[a, b]` là chính xác (bậc đa thức ≤ 4), tránh công thức đóng dễ sai dấu. Viết kèm test so với `uniform_feq` và `point_feq` (giới hạn đoạn rất ngắn).
- `stations()`: tại mặt cắt x, lực = tích phân tải trên `[a, min(x, b)]`, mômen = mômen tĩnh của phần đó quanh x; giải tích đơn giản cho tải bậc 1.
- `applied` (tổng tải để kiểm tra cân bằng) phải cộng hợp lực `(value + valueEnd)/2 · (b − a) · L`.

## 7. Ngoài phạm vi

- Truyền tải sàn về thanh biên dưới dạng tam giác/hình thang thật (thay tải đều tương đương). Việc này sẽ đổi kết quả của mọi mô hình có sàn, cần PR và benchmark riêng.
- Tải phân bố theo chiều dài chiếu (projected), tải mômen phân bố, tải nhiệt. Bộ nhập tiếp tục báo lỗi.
- Đối chiếu với kết quả ETABS/SAP2000 thật: vẫn chờ bảng kết quả xuất. Mở được file ETABS **không** có nghĩa là tương đương ETABS.

## 8. Rủi ro đã biết

- Bộ giải Rust hiện coi `kind` lạ là tải đều: nếu PR A không sửa chỗ này trước, một file dùng `linear` có thể bị giải sai mà không báo.
- Offset đầu thanh (D2) có thể làm lệch vị trí tải tập trung đã có; cần quyết định rõ trước khi viết.
- `remapFrameLoads` cắt tải theo đoạn: dễ sai ở biên (tải bắt đầu đúng tại nút chia, đoạn dài 0), cần test riêng.
- Nhiều bản ghi TRAPF nối tiếp trên cùng thanh (ETABS ghi tải nhiều đoạn như vậy): cộng chồng phải đúng, không gộp.

## 9. Cách các tác tử AI phối hợp

1. Đọc tài liệu này, `docs/WORK_ROUTING.md`, `docs/HANDOFF.md` trên `main`, và issue điều phối.
2. **Nhận việc**: bình luận trên issue `Nhận PR A — <tác tử/mô hình> — nhánh <tên>` trước khi viết mã. Một PR một người viết.
3. Ghi **checkpoint** (mẫu trong `docs/HANDOFF.md`) trong mô tả PR sau mỗi mốc; khi phải dừng, ghi `PAUSED` và bước tiếp theo.
4. **Review chéo** bởi tác tử khác (mô hình khác càng tốt) trước khi merge. Người review ghi kết quả vào PR và tóm tắt trên issue.
5. Câu hỏi thuộc quyền chủ dự án (D1–D3, thay đổi kết quả mô hình cũ) hỏi trên issue, không tự quyết.
6. Khi PR merge: đánh dấu mục trong checklist của issue và cập nhật mục "Trạng thái" ở đầu tài liệu này.

## Checkpoint — PR A (21/11/2026, UTC+7)

- Trạng thái: REVIEW. Nhánh `claude/festive-ritchie-e8hzpu` (đã chứa PR #21 và `b7c5c80`). Người viết: Claude. Cần tác tử khác review.
- Đã làm:
  - Schema TS `kind: "linear"` + `start`, `end`, `valueEnd`; `model.schema.json` sinh lại; `schemaVersion` giữ 1. `checkModel`: `invalid_linear_load`, `linear_load_with_offsets`.
  - Rust: `FrameLoad` thêm trường; bộ giải **từ chối `kind` lạ** (trước đây coi là tải đều), kiểm tra đoạn/cường độ, từ chối `linear` trên thanh có vùng cứng (chờ PR D); `MemberLoad::Linear`, `linear_feq` (Gauss 3 điểm trên `point_feq`, chính xác), nội lực tại trạm theo công thức đóng, cộng hợp lực vào kiểm tra cân bằng.
  - 8 benchmark Rust (`crates/fem-solver/src/benchmarks.rs`, tiền tố `linear_`): tam giác hai chiều trên công xôn, tải một đoạn (ca 135 kN·m), dầm đơn giản tải một đoạn, hình thang trên dầm hai đầu ngàm, `linear` đều ≡ `distributed` theo 7 phương trên thanh xiên có góc xoay, đầu nhả ≡ gối khớp, cắt qua hai đoạn ≡ thanh liền, tổ hợp và đầu vào sai. Kiểm chứng đột biến: đổi Gauss 3 → 2 điểm hoặc sai công thức mômen tại trạm làm hỏng 3/8 test.
  - R1: `loadOnSegment` (model-core) cắt tải theo đoạn, giữ hợp lực và mômen tĩnh (test); `remapFrameLoads` của bộ nhập dùng hàm này. Nhân bản giữ **góc xoay và vùng cứng** của thanh (trước đây mất, làm tải theo trục địa phương đổi phương); test dời nút, nhân bản tịnh tiến/đối xứng/sang tầng, tắt chép tải, Undo.
  - Khung nhìn vẽ tải `linear` thành hình thang (tối thiểu, để không vẽ nhầm thành tải tập trung; giao diện đầy đủ ở PR C, chưa có e2e cho hình vẽ này).
- Kiểm thử cục bộ: `cargo test` fem-core/fem-solver (47), clippy fem-*, `pnpm typecheck`, `pnpm test` (model-core 95, io-formats 104, viewer 21, desktop 13), build desktop có WASM, Playwright 105/105. CI chưa chạy cho commit này.
- Chưa làm / câu hỏi mở:
  - Bộ nhập vẫn báo `line_load_not_uniform` (PR B sẽ đổi sang tạo `linear`).
  - **Hỏi chủ dự án:** khi nhân bản **đối xứng**, tải theo phương tổng thể (ví dụ `globalX`) và góc xoay trục địa phương hiện được chép nguyên, không lật theo gương. Có cần lật không? Chưa tìm tài liệu CSI để đối chiếu.
  - Chưa có lệnh dời thanh hay chia thanh trong giao diện; khi có phải dùng `loadOnSegment`.

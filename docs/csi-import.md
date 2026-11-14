# Nhập file văn bản CSI: ETABS `.e2k`

Cập nhật 14/11/2026. Thuộc mốc **M1 — CSI Text Import MVP** trong [kế hoạch nhập và đối chiếu CSI](https://github.com/thai-coder/NexFEM/blob/main/docs/CSI_IMPORT_VALIDATION_PLAN.md). Chưa có `.s2k` (SAP2000) và chưa đối chiếu kết quả với ETABS (M2 vẫn bị chặn vì chưa có bảng kết quả xuất từ ETABS).

## Dùng trong app

File ▸ **Nhập ETABS (.e2k)…** → chọn file → hộp thoại báo cáo nhập. Báo cáo gồm:

- số lượng theo loại (trong file / đã nhập);
- mục **Không nhập được** (mức `error`): dữ liệu ảnh hưởng phân tích nhưng bị bỏ;
- mục **Nhập gần đúng / bỏ thuộc tính** (mức `warning`);
- mục **Ghi chú** (mức `info`): dữ liệu không ảnh hưởng mô hình phân tích tuyến tính.

Mỗi mục ghi số lần gặp và tối đa 20 tên đối tượng ETABS. Người dùng xem báo cáo rồi mới bấm **Mở mô hình đã nhập**. Bấm Huỷ thì mô hình hiện tại không đổi.

## Mã nguồn

- `packages/io-formats/src/csi/e2k-parse.ts`: tách cú pháp (token trong ngoặc kép, chuỗi dính liền từ khoá sau, CRLF/LF, UTF-8 hoặc Windows-1252).
- `packages/io-formats/src/csi/e2k-import.ts`: ánh xạ sang mô hình NexFEM và báo cáo.
- `packages/io-formats/src/csi/units.ts`: đổi đơn vị (hệ số định nghĩa chính xác).
- Tách riêng khỏi `model-core` như kế hoạch yêu cầu. Kết quả đi qua `parseModel` (schema) của `model-core`.

## Phạm vi hỗ trợ

Cột "File mẫu" cho biết cú pháp đã có trong file ETABS 23.2.0 thật (`tests/fixtures/csi/etabs/`) hay chưa.

| Dữ liệu ETABS | NexFEM | File mẫu |
| --- | --- | --- |
| `UNITS` LB, KIP, N, KN, KGF, TONF · IN, FT, MM, CM, M | đổi sang kN, m | LB, IN |
| `STORY` (ghi từ trên xuống, `HEIGHT`, `ELEV`, `MASTERSTORY`, `SIMILARTO`) | tầng | có (trừ `SIMILARTO`) |
| `GRIDSYSTEM` Cartesian, `GRID` DIR X/Y | lưới trục | có |
| `MATERIAL` Steel/Concrete/Rebar/khác: E, U, WEIGHTPERVOLUME, FY/FC | vật liệu | có |
| `FRAMESECTION` "Steel I/Wide Flange" D, B, TF, TW | chữ I (r = 0, ghi chú) | có |
| "Steel Tube" D, B, TF | ống hộp (góc vuông) | có |
| "Filled Steel Tube" | ống thép rỗng, **bỏ phần bê tông** (cảnh báo) | có |
| "Concrete Rectangular" D, B | chữ nhật | có |
| "Steel Angle", "General", hình khác | **không nhập** (lỗi), thanh dùng chúng bị bỏ | Angle, General |
| `SHELLPROP` Slab/Wall: MATERIAL, MODELINGTYPE, thickness | tiết diện sàn/vách | có |
| Deck | **không nhập** (cảnh báo) | có |
| `POINT` X Y [DZ] | nút, z = cao độ tầng − DZ | có |
| `LINE` BEAM/COLUMN/BRACE i j n | thanh; đầu i ở tầng thấp hơn n tầng | có |
| `LINEASSIGN` SECTION, RELEASE | tiết diện, nhả liên kết | có |
| `AREA` FLOOR n điểm + n số tầng | sàn | có (số tầng = 0) |
| `POINTASSIGN` RESTRAINT | gối | **chưa** (theo tài liệu ETABS) |
| `LOADPATTERN` TYPE, SELFWEIGHT | mẫu tải | có |
| `LOADCASE` Linear Static (LOADPAT/SF), Modal | trường hợp tải | có |
| `COMBO` Linear Add / Envelope / SRSS / Absolute Add, LOADCASE và LOADCOMBO | tổ hợp (kể cả lồng nhau) | Linear Add |
| `LINELOAD` UNIFF; TRAPF | tải đều; hình thang đổi thành tải đều giữ hợp lực (cảnh báo) | có |
| `AREALOAD` UNIFF GRAV/Z | tải sàn | GRAV |

**Không nhập, có báo cáo:** tải tập trung tại nút (NexFEM chưa có), lò xo dọc thanh và lò xo nền dưới sàn, góc xoay trục địa phương `ANG`, điểm chèn `CARDINALPT`, đoạn lệch đầu thanh khác 0, liên kết nửa cứng `PARFIXM*`, giới hạn kéo/nén, sàn cứng, P-Delta, trường hợp tải khác Linear Static/Modal, Range Add.

**Bỏ qua (ghi chú):** chia lưới, trạm xuất kết quả, thiết kế, nhóm, nhật ký, thông tin dự án, cốt thép, cáp, liên kết, panel zone, hàm phổ/lịch sử, nguồn khối lượng.

## Giả định ánh xạ (cần kiểm chứng thêm)

1. **Cao độ nút = cao độ tầng − DZ.** Giá trị thứ ba của `POINT` là khoảng cách xuống dưới tầng được gán. Bằng chứng trên file mẫu: với quy ước này cả 108 cặp (thanh cột, tầng) đều đứng thẳng và đi từ dưới lên. Quy ước ngược lại làm tất cả cột đi từ trên xuống.
2. **Số cuối của `LINE`** là số tầng phía dưới của đầu i: cột có số 1 bắt đầu ở tầng Base trong file mẫu.
3. **Số cuối của `AREA`** (mỗi đỉnh một số) hiểu như trên; file mẫu chỉ có giá trị 0.
4. **`RELEASE "PINNED"`** = nhả M2, M3 ở hai đầu, không nhả xoắn. Báo cáo ghi chú mỗi lần gặp.
5. **`RESTRAINT`** đọc theo dạng "UX UY UZ RX RY RZ"; chưa có trong file mẫu, chỉ có test dữ liệu tự tạo.
6. Tiết diện ETABS lấy từ AISC chỉ ghi D, B, TF, TW, không có bán kính lượn: NexFEM tính với r = 0 nên A, I nhỏ hơn bảng AISC khoảng 4–5 % (ETABS dùng giá trị bảng đã lưu trong file `.EDB`).
7. Nút trùng nhau trong dung sai `MERGETOL` của file được gộp.
8. Tiết diện có trong file nhưng không thanh nào dùng vẫn được nhập (giống thư viện tiết diện của ETABS).

## Kết quả với file mẫu ETABS 23.2.0

| Loại | Trong file | Đã nhập | Ghi chú |
| --- | ---: | ---: | --- |
| Thanh | 322 | 298 | 24 giằng dùng tiết diện chữ L bị bỏ |
| Tiết diện thanh | 305 | 294 | 8 chữ L, 3 General |
| Sàn | 29 | 29 | 21 sàn móng có lò xo nền bị bỏ lò xo |
| Tải thanh / tải sàn | 24 / 16 | 24 / 16 | 9 tải hình thang đổi thành tải đều |
| Tải tập trung tại nút | 31 | 0 | NexFEM chưa có |
| Trường hợp tải / tổ hợp | 12 / 87 | 12 / 87 | |

Mô hình nhập **không có gối**, vì file dựa vào lò xo nền. Phải gán gối trước khi chạy F5. Kết quả phân tích **chưa so được với ETABS**, và sẽ khác ETABS vì: thiếu giằng, thiếu tải tập trung (gió, động đất theo phương ngang), thiếu lò xo, cột HSS nhồi bê tông tính như ống rỗng, góc xoay trục bị bỏ.

Mô hình này đặt hầu hết đối tượng bằng DZ dưới một tầng duy nhất (Story1, cao 12 in), nên mặt bằng của tầng chỉ thấy những gì nằm đúng cao độ tầng. Xem bằng khung nhìn 3D hoặc mặt đứng.

## Kiểm thử

- `packages/io-formats/test/e2k-fixture.test.ts` (file thật): toàn vẹn byte, số bản ghi theo ghi chú tiếp nhận, đơn vị, tầng, lưới, vật liệu, tiết diện, hướng cột, nhả liên kết, tải, tổ hợp lồng nhau, mã báo cáo, mô hình hợp lệ, nhập hai lần cho cùng kết quả.
- `packages/io-formats/test/e2k-synthetic.test.ts` (dữ liệu tự tạo, ghi rõ trong file): gối, nhiều tầng, gộp nút, đơn vị lạ, Windows-1252.
- `apps/desktop/src/services/csiImport.test.ts`: mọi mã báo cáo có bản dịch tiếng Việt và tiếng Anh.
- `tests/e2e/specs/e2k-import.spec.ts`: nhập file thật qua menu, kiểm tra báo cáo, mở mô hình, F5 bị chặn vì thiếu gối, Huỷ.

## Việc tiếp theo

1. Tải tập trung tại nút (cần thêm vào schema và bộ giải; phối hợp với Codex).
2. Tiết diện General (A, I, J nhập trực tiếp) và chữ L.
3. Góc xoay trục địa phương của thanh.
4. Lò xo nút / lò xo nền (bộ giải hiện chỉ có gối cứng).
5. Nhập `.s2k` khi có file SAP2000 thật trong repo.
6. Đối chiếu kết quả (M2) khi có bảng chuyển vị, phản lực, nội lực xuất từ ETABS.

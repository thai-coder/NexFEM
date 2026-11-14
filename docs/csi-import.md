# Nhập file văn bản CSI: ETABS `.e2k` và SAP2000 `.s2k`

Cập nhật 14/11/2026. Thuộc mốc **M1 — CSI Text Import MVP** trong [kế hoạch nhập và đối chiếu CSI](https://github.com/thai-coder/NexFEM/blob/main/docs/CSI_IMPORT_VALIDATION_PLAN.md). Cả hai bộ nhập đã kiểm tra trên file thật (ETABS 23.2.0; SAP2000 23.1.0 và 25.3.1). Chưa đối chiếu kết quả phân tích (M2 bị chặn vì chưa có bảng kết quả xuất từ ETABS/SAP2000).

## Dùng trong app

File ▸ **Nhập file** ▸ một mục riêng cho mỗi định dạng:

| Mục | Đuôi file trong hộp chọn | Trạng thái |
| --- | --- | --- |
| ETABS (.e2k)… | `.e2k`, `.$et` (và `.edb` để báo cách xuất) | có |
| SAP2000 (.s2k, .$2k)… | `.s2k`, `.$2k`, `.2k` (và `.sdb` để báo cách xuất) | có |
| DXF… · IFC… · Excel… | — | Giai đoạn 8 |

Mỗi mục là một lệnh riêng (`file.importEtabs`, `file.importSap`, …) nên thêm định dạng mới chỉ cần thêm một lệnh và một dòng trong menu con (`MENUS` trong `apps/desktop/src/commands/app.ts`), không đụng các mục khác. Định dạng thật vẫn nhận theo **nội dung** file: chọn mục ETABS mà file là SAP2000 thì vẫn nhập theo SAP2000 và có cảnh báo. File nhị phân (`.sdb`, `.edb`) không đọc được (định dạng riêng của CSI); báo cáo ghi rõ cần xuất file văn bản bằng File → Export trong chương trình gốc.

Chọn file → hộp thoại báo cáo nhập. Báo cáo gồm:

- số lượng theo loại (trong file / đã nhập);
- mục **Không nhập được** (mức `error`): dữ liệu ảnh hưởng phân tích nhưng bị bỏ;
- mục **Nhập gần đúng / bỏ thuộc tính** (mức `warning`);
- mục **Ghi chú** (mức `info`): dữ liệu không ảnh hưởng mô hình phân tích tuyến tính.

Mỗi mục ghi số lần gặp và tối đa 20 tên đối tượng trong file nguồn. Người dùng xem báo cáo rồi mới bấm **Mở mô hình đã nhập**. Bấm Huỷ thì mô hình hiện tại không đổi.

## Mã nguồn

- `packages/io-formats/src/csi/e2k-parse.ts`: tách cú pháp (token trong ngoặc kép, chuỗi dính liền từ khoá sau, CRLF/LF, UTF-8 hoặc Windows-1252).
- `packages/io-formats/src/csi/e2k-import.ts`: ánh xạ sang mô hình NexFEM và báo cáo.
- `packages/io-formats/src/csi/s2k-parse.ts`, `s2k-import.ts`: bộ nhập SAP2000 (xem mục SAP2000 bên dưới).
- `packages/io-formats/src/csi/detect.ts`: nhận diện định dạng theo nội dung, file nhị phân `.sdb`, `importCsiFile`.
- `packages/io-formats/src/csi/diagnostics.ts`: báo cáo dùng chung (mức, mã, tham số, số lần, dòng, đối tượng).
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
| `LINELOAD` UNIFF; TRAPF, phương GRAV, X, Y, Z, 1 | tải đều; hình thang đổi thành tải đều giữ hợp lực (cảnh báo) | GRAV |
| `LINELOAD` phương 2, 3 (trục địa phương) | tải theo trục 2, 3 của NexFEM (cùng quy ước CSI, ghi chú: chưa có file thật có loại tải này) | chưa |
| `LINEASSIGN` ANG | góc xoay trục địa phương `Frame.angle` | 34 cột ANG 90 |
| `AREALOAD` UNIFF GRAV/Z | tải sàn | GRAV |

**Không nhập, có báo cáo:** tải tập trung tại nút (NexFEM chưa có), lò xo dọc thanh và lò xo nền dưới sàn, điểm chèn `CARDINALPT`, đoạn lệch đầu thanh khác 0, liên kết nửa cứng `PARFIXM*`, giới hạn kéo/nén, sàn cứng, P-Delta, trường hợp tải khác Linear Static/Modal, Range Add.

**Bỏ qua (ghi chú):** chia lưới, trạm xuất kết quả, thiết kế, nhóm, nhật ký, thông tin dự án, cốt thép, cáp, liên kết, panel zone, hàm phổ/lịch sử, nguồn khối lượng.

## Trục địa phương của thanh

NexFEM dùng đúng quy ước mặc định của ETABS/SAP2000. Trục 1 đi từ đầu i đến đầu j. Thanh không thẳng đứng có trục 2 hướng lên, trong mặt phẳng đứng chứa thanh. Thanh thẳng đứng có trục 2 = +X tổng thể. Trục 3 = 1 × 2.

`Frame.angle` (độ) xoay trục 2, 3 quanh trục 1: e2' = cos·e2 + sin·e3, dương ngược chiều kim đồng hồ khi nhìn từ đầu +1. Bộ giải (`crates/fem-solver/src/element.rs::local_axes`), biểu đồ mô men (`packages/viewer/src/moment.ts`) và cả hai bộ nhập dùng chung quy ước này. Sửa góc trong bảng Properties của thanh. Test: `local_axis_angle_turns_the_strong_axis_like_csi` kiểm tra cột công xôn tải theo Y ở góc 0°, 90° và 30°, so với lời giải giải tích theo I22 và I33.

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

Mô hình nhập **không có gối**, vì file dựa vào lò xo nền. Phải gán gối trước khi chạy F5. Kết quả phân tích **chưa so được với ETABS**, và sẽ khác ETABS vì: thiếu giằng, thiếu tải tập trung (gió, động đất theo phương ngang), thiếu lò xo, cột HSS nhồi bê tông tính như ống rỗng.

Mô hình này đặt hầu hết đối tượng bằng DZ dưới một tầng duy nhất (Story1, cao 12 in), nên mặt bằng của tầng chỉ thấy những gì nằm đúng cao độ tầng. Xem bằng khung nhìn 3D hoặc mặt đứng.

## SAP2000 `.s2k` / `.$2k`

File thật trong repo: `tests/fixtures/csi/sap2000/` (xem README: nguồn, SHA-256). Cú pháp: mỗi bảng mở bằng `TABLE:  "TÊN"` (một file thật có tiêu đề thiếu dấu ngoặc kép đóng), bản ghi là các cặp `Tên=Giá trị` (giá trị có dấu cách nằm trong ngoặc kép), ` _` cuối dòng nối bản ghi sang dòng sau, kết thúc bằng `END TABLE DATA`.

| Bảng SAP2000 | NexFEM | File mẫu |
| --- | --- | --- |
| `PROGRAM CONTROL` CurrUnits ("lb, ft, F", "Kip, ft, F"…) | đổi sang kN, m | lb-ft, kip-ft |
| `ACTIVE DEGREES OF FREEDOM` | bậc tự do không hoạt động thành gối ở mọi nút (ghi chú) | UX, RY, RZ tắt |
| `GRID LINES` X, Y; Z | lưới trục; trục Z thành tầng (SAP2000 không có tầng) | có |
| `MATERIAL PROPERTIES 01/02/03A/03B` | vật liệu: E1, U12, UnitWeight, Fy/Fc | có |
| `FRAME SECTION PROPERTIES 01` I/Wide Flange (t3, t2, tf, tw, FilletRadius) | chữ I **có bán kính lượn** | 273 + 132 tiết diện W |
| Box/Tube, Rectangular, Circle, Pipe | hộp, chữ nhật, tròn, ống | chưa |
| hình khác | **không nhập** (lỗi) | — |
| AS2, AS3 của tiết diện | `shearAreas`: có biến dạng cắt như SAP2000 | có |
| `JOINT COORDINATES` (GLOBAL, Cartesian) | nút | có |
| `JOINT RESTRAINT ASSIGNMENTS` | gối | có |
| `CONNECTIVITY - FRAME` + `FRAME SECTION ASSIGNMENTS` | thanh; loại suy từ phương (đứng → cột, ngang → dầm, xiên → giằng) | có |
| `FRAME RELEASE ASSIGNMENTS 1` | nhả liên kết | có |
| `FRAME LOCAL AXES ASSIGNMENTS 1` Angle | góc xoay trục địa phương `Frame.angle`; trục nâng cao (AdvanceAxes) chưa hỗ trợ (cảnh báo) | 2 cột Angle 90 |
| `FRAME RELEASE ASSIGNMENTS 2 - PARTIAL FIXITY` | ≥ 1000 × 4EI/L: coi như không nhả; ≤ 0,001 × 4EI/L: khớp; ở giữa: **lỗi**, nhập thành nhả | M3 rất cứng |
| `CONNECTIVITY - AREA` + `AREA SECTION ASSIGNMENTS` | sàn (pháp tuyến gần ngang → vách) | có |
| Mặt tiết diện `None` | sàn không trọng lượng; tải chia về thanh/nút biên (ghi chú) | có |
| `LOAD PATTERN DEFINITIONS`, `LOAD CASE DEFINITIONS` (LinStatic, LinModal), `CASE - STATIC 1` | mẫu tải, trường hợp tải | có |
| `COMBINATION DEFINITIONS` (Linear Add, Envelope, SRSS, Absolute Add; lồng nhau) | tổ hợp | có |
| `FRAME LOADS - DISTRIBUTED` (Force; Gravity, X, Y, Z; Local 1, 2, 3) | tải đều; hình thang đổi thành tải đều giữ hợp lực (cảnh báo) | Gravity |
| `FRAME LOADS - POINT` | tải tập trung trên thanh tại `RelDist` | Gravity |
| `AREA LOADS - UNIFORM` (Gravity, Z, Local 3) | tải sàn | Gravity, Local 3 |
| `JOINT LOADS - FORCE` | **không nhập** (lỗi): NexFEM chưa có tải nút | có |

**Cảnh báo (nhập gần đúng):** điểm chèn khác 10 (trọng tâm), đoạn cứng đầu thanh (RigidFactor > 0), hệ số sửa đặc trưng thanh/tiết diện khác 1, thanh cong (nhập thành thẳng), trục địa phương nâng cao.

**Đặc trưng tiết diện được đối chiếu với giá trị SAP2000 ghi trong file** (A, I33, I22, TorsConst lấy từ bảng AISC): với 273 tiết diện W của file OMF, NexFEM lệch lớn nhất A 0,73 %, I 1,44 %, J 1,14 %. Báo cáo chỉ cảnh báo tiết diện **có thanh dùng** lệch quá A, I 1 % hoặc J 5 %; tiết diện chỉ nằm trong thư viện được tóm tắt ở một ghi chú.

**FilletRadius = 0:** file SAP2000 25.3.1 có 31 tiết diện W ghi FilletRadius = 0 trong khi A, I, J trong bảng có tính góc lượn. Nếu dùng r = 0, J của W8X10 nhỏ hơn bảng 18 %. Bộ nhập suy r từ diện tích dư: r = √((A_file − A_{r=0}) / (4 − π)), chỉ khi kết quả hợp lý (r nhỏ hơn nửa phần cánh nhô ra và nửa chiều cao bụng), và ghi cảnh báo cho tiết diện có thanh dùng. Kiểm chứng: W8X24 suy ra r = 10,0 mm, đúng bằng k_des − t_f của AISC (0,794 − 0,400 in). Sau khi suy, độ lệch lớn nhất còn A 0,73 %, I 1,34 %, J 1,91 %.

### Kết quả với hai file SAP2000 thật

| | 24061_OMF.s2k (23.1.0) | Roof_model.2k (25.3.1) |
| --- | --- | --- |
| Nút / thanh / sàn | 4 / 3 / 0 | 16 / 13 / 4 (None) |
| Tiết diện thanh | 273 / 273 | 132 / 132 |
| Mẫu tải / trường hợp / tổ hợp | 53 / 12 / 87 | 5 / 6 / 18 |
| Tải thanh / tải sàn | 14 / 0 | 0 / 16 |
| Không nhập được | 2 tải nút (WY, EY) | không có |
| Cảnh báo | liên kết nửa cứng M3 rất cứng (coi như ngàm), điểm chèn 8 của dầm | suy bán kính lượn W8X24 |

File OMF là khung phẳng YZ, hai cột xoay 90°: nhờ góc xoay, trục 2 của cột nằm trong mặt phẳng khung và cột uốn trong mặt phẳng quanh trục khoẻ I33, như SAP2000. Tải gió và động đất WY, EY của file này là tải nút, nên chưa nhập được.

## Kiểm thử

- `packages/io-formats/test/s2k-fixture.test.ts` (hai file SAP2000 thật và file `.sdb`): toàn vẹn byte, cú pháp (dòng nối, tiêu đề thiếu ngoặc kép), đơn vị, tầng từ trục Z, bậc tự do không hoạt động, gối, nhả liên kết và liên kết nửa cứng, tải thanh, tải sàn trên mặt None, tổ hợp lồng nhau, đặc trưng của mọi tiết diện so với bảng trong file, suy bán kính lượn, nhận diện `.sdb`, chọn nhầm mục.
- `packages/io-formats/test/e2k-fixture.test.ts` (file thật): toàn vẹn byte, số bản ghi theo ghi chú tiếp nhận, đơn vị, tầng, lưới, vật liệu, tiết diện, hướng cột, nhả liên kết, tải, tổ hợp lồng nhau, mã báo cáo, mô hình hợp lệ, nhập hai lần cho cùng kết quả.
- `packages/io-formats/test/e2k-synthetic.test.ts` (dữ liệu tự tạo, ghi rõ trong file): gối, nhiều tầng, gộp nút, đơn vị lạ, Windows-1252.
- `apps/desktop/src/services/csiImport.test.ts`: mọi mã báo cáo của cả hai bộ nhập có bản dịch tiếng Việt và tiếng Anh.
- `tests/e2e/specs/e2k-import.spec.ts`: menu con Nhập file, nhập file ETABS và SAP2000 thật qua menu, kiểm tra báo cáo, mở mô hình, F5 bị chặn vì thiếu gối, Huỷ, file `.sdb`, chọn nhầm mục.

## Việc tiếp theo

1. Tải tập trung tại nút (cần thêm vào schema và bộ giải; phối hợp với Codex).
2. Tiết diện General (A, I, J nhập trực tiếp) và chữ L.
3. Lò xo nút / lò xo nền (bộ giải hiện chỉ có gối cứng).
4. Đối chiếu kết quả (M2) khi có bảng chuyển vị, phản lực, nội lực xuất từ ETABS/SAP2000.

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
| "Steel Angle" D, B, TF, TW | chữ L (trục hình học, bỏ I23 và bán kính lượn; cảnh báo) | 8 tiết diện, 24 giằng |
| "General" AREA, AS2, AS3, I33, I22, TORSION | tiết diện tổng quát, nhập thẳng đặc trưng và diện tích chịu cắt | 3 tiết diện |
| hình khác | **không nhập** (lỗi), thanh dùng chúng bị bỏ | — |
| `LINEASSIGN AUTOMESH "YES"` | chia thanh tại nút nằm trên thân thanh (xem "Chia thanh tại nút") | 322 thanh |
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
| `LINESPRING` U1, U2, U3 (lực/dài²) + `LINEASSIGN SPRINGPROP` | lò xo nút ở hai đầu thanh, mỗi đầu k·L/2 theo trục địa phương (cảnh báo: gần đúng) | 24 dầm móng, U2 |
| `AREASPRING` U1, U2, U3 (lực/dài³) + `AREAASSIGN SPRINGPROP` | lò xo nút ở các góc sàn ngang, k × diện tích chịu tải của góc (cảnh báo: gần đúng) | 21 móng, U3 |
| `NONLINEAROPT* "Compression Only"` | lò xo tuyến tính, chịu cả kéo (cảnh báo) | có |
| `POINTLOAD` TYPE FORCE: FX, FY, FZ, MX, MY, MZ | tải nút `jointLoads` theo hệ tổng thể. Điểm riêng trên thanh được xử lý theo thành phần tải (xem dưới) | FX, FY |

**Không nhập, có báo cáo:** lò xo nút (`POINTASSIGN SPRINGPROP`, chưa có trong file mẫu), điểm chèn `CARDINALPT`, đoạn lệch đầu thanh khác 0, liên kết nửa cứng `PARFIXM*`, giới hạn kéo/nén, sàn cứng, P-Delta, trường hợp tải khác Linear Static/Modal, Range Add.

**Bỏ qua (ghi chú):** chia lưới, trạm xuất kết quả, thiết kế, nhóm, nhật ký, thông tin dự án, cốt thép, cáp, liên kết, panel zone, hàm phổ/lịch sử, nguồn khối lượng.

## Trục địa phương của thanh

NexFEM dùng đúng quy ước mặc định của ETABS/SAP2000. Trục 1 đi từ đầu i đến đầu j. Thanh không thẳng đứng có trục 2 hướng lên, trong mặt phẳng đứng chứa thanh. Thanh thẳng đứng có trục 2 = +X tổng thể. Trục 3 = 1 × 2.

`Frame.angle` (độ) xoay trục 2, 3 quanh trục 1: e2' = cos·e2 + sin·e3, dương ngược chiều kim đồng hồ khi nhìn từ đầu +1. Bộ giải (`crates/fem-solver/src/element.rs::local_axes`), biểu đồ mô men (`packages/viewer/src/moment.ts`) và cả hai bộ nhập dùng chung quy ước này. Sửa góc trong bảng Properties của thanh. Test: `local_axis_angle_turns_the_strong_axis_like_csi` kiểm tra cột công xôn tải theo Y ở góc 0°, 90° và 30°, so với lời giải giải tích theo I22 và I33.

## Ổn định hoá cơ cấu (bộ giải)

Bậc tự do không có độ cứng, hoặc có độ cứng cực nhỏ, là một cơ cấu. Ví dụ: nút chỉ nối các thanh khớp nằm trong một mặt phẳng, hoặc các thanh gần như thẳng hàng vì toạ độ lệch 1e-6 m. Trước đây bộ giải dừng ngay. Nay (lựa chọn của chủ dự án):

1. Khi phân tích Cholesky, trụ ≤ max(1e-11 × đường chéo, 1e-12 × độ cứng lớn nhất của mô hình) bị coi là cơ cấu. Ngưỡng tuyệt đối bắt các cơ cấu "gần như".
2. Bậc tự do đó được thêm độ cứng 1e-9 × độ cứng lớn nhất rồi phân tích lại. Cảnh báo `mechanism_stabilized` liệt kê nút, phương và độ lớn, kèm câu "chuyển vị theo các phương này không có ý nghĩa".
3. Sau khi giải từng trường hợp, nếu độ cứng giả này (hoặc lò xo xoay đơn vị ở khớp xoay tự do) phải chịu lực đáng kể, tức tải đi vào cơ cấu, thì bộ giải báo lỗi `unstable` và không trả kết quả.
4. Mô hình hoàn toàn không có gối hay lò xo vẫn báo `unstable` ngay.

Nút chỉ có lò xo, không có thanh nối vào (ví dụ góc móng), nay cũng được đưa vào tính và nhận tải.

Đây **không** phải lò xo mô phỏng vật thật. Lò xo thật là gối đàn hồi, nền đất, gối cao su. Cách ETABS/SAP2000 xử lý cơ cấu bên trong chưa kiểm chứng được, nên NexFEM chọn cách minh bạch nói trên.

Test: `unloaded_mechanism_is_stabilized_with_warning_loaded_one_fails`, `near_mechanism_with_tiny_stiffness_is_detected`, `sprung_joint_without_frames_takes_its_load`, `unstable_model_reports_joint`.

## Chia thanh tại nút

ETABS (`AUTOMESH "YES"`) và SAP2000 (`FRAME AUTO MESH ASSIGNMENTS` AutoMesh=Yes, AtJoints=Yes) tự chia thanh khi phân tích, tại nút nằm trên thân thanh: đầu thanh khác hoặc góc sàn, trong dung sai MERGETOL / MergeTol. Nếu không chia, thanh tựa lên thân thanh khác sẽ treo lơ lửng. Bộ nhập chia giống vậy (`splitFramesAtJoints` trong `locate.ts`):

- Các đoạn mang nhãn `B6-1`, `B6-2`, …
- Nhả liên kết và vùng cứng giữ ở hai đầu ngoài.
- Tiết diện, góc xoay, tầng chép sang mọi đoạn.
- Tải phân bố chép cho mọi đoạn. Tải tập trung vào đoạn chứa vị trí, đổi lại vị trí tương đối.
- Lò xo dọc thanh quy về nút theo từng đoạn.

Chia tại nút là chính xác với phần tử dầm tuyến tính. Chia tại giao điểm của hai thanh cắt nhau không có nút chung (`MESHATINTERSECTIONS`, `AtFrames`) chưa làm.

Kết quả: file ETABS mẫu có 87 thanh được chia thành 287 đoạn; Roof_model có 7 thanh thành 14 đoạn.

## Thép góc chữ L và tiết diện tổng quát

`{ shape: "L", h, b, tw, tf }`: cánh `h` dọc trục 2 dày `tw`, cánh `b` dọc trục 3 dày `tf`. I33, I22 tính quanh trục hình học qua trọng tâm, song song với cánh. Bỏ tích quán tính I23 (trục chính xoay 45° với thép góc đều) và bán kính lượn. J thành mỏng.

Đối chiếu L3X3X1/2 với bảng AISC: trọng tâm 0,932 in (bảng 0,929), I 2,216 in⁴ (bảng 2,20). TypeScript và Rust cùng công thức; test ở cả hai bên.

Hầu hết thép góc dùng làm giằng khớp hai đầu, chỉ chịu lực dọc, nên sai số uốn ít ảnh hưởng.

`{ shape: "general", A, I33, I22, J, h?, b? }`: nhập thẳng đặc trưng; `h`, `b` chỉ để vẽ. Có trong hộp thoại Tiết diện thanh.

## Lò xo nút

`Joint.springs` = [Kx, Ky, Kz] (kN/m) và [Krx, Kry, Krz] (kN·m/rad) theo hệ tổng thể, không ghép; bậc tự do đã giữ thì bỏ qua lò xo. Bộ giải cộng vào đường chéo ma trận độ cứng và đưa lực lò xo −k·u vào phản lực (kiểm tra cân bằng). Check model coi nút có lò xo là gối. Sửa trong Properties của nút; khung nhìn vẽ ký hiệu zigzag cho nút chỉ có lò xo. Test: `joint_spring_carries_load_and_shows_in_reactions` (công xôn trên lò xo: chuyển vị, phản lực, tổ hợp, chỉ lò xo không gối).

**Chia tấm tại nút nằm bên trong** (`meshedNodeAreas` trong `locate.ts`). ETABS chia tấm móng tại nút có thanh nối vào nằm trong tấm, ví dụ chân cột C3 (nút 57) giữa móng F17. Khi quy lò xo nền, bộ nhập làm tương tự:

- MERGETOL giới hạn khoảng cách tới mặt phẳng tấm. Trong mặt phẳng chiếu, nút phải nằm trong đa giác hoặc ngay trên cạnh, trong sai số số học.
- Bộ nhập sắp các nút theo tọa độ chiếu và ID trước khi tam giác hoá. Tấm lồi dùng lưới quạt, tấm lõm dùng cắt tai với đường chéo tránh các đỉnh còn lại. Mỗi tam giác chia 1/3 diện tích cho mỗi đỉnh. Bộ nhập kiểm tra tổng diện tích trước khi quy lò xo.
- Tấm không có nút thêm dùng cách quy lò xo về góc như trước (A/4 mỗi góc đối với hình chữ nhật). Khi chia tấm thất bại, báo cáo nhập cảnh báo rằng lò xo chỉ được quy về góc.
- Tấm trong mô hình không đổi (góc và tải mặt như cũ). Việc chia chỉ dùng để quy lò xo, nên tải mặt vẫn phân phối đúng một lần.

File mẫu có 19 tấm móng với 22 nút bên trong. Tĩnh tải CDL lún lớn nhất còn 9,3 cm (trước là 40,6 m vì cột C3 treo). Test: `test/locate.test.ts` và ca "chân cột C3 (nút 57)" trong `e2k-fixture.test.ts`.

Lò xo dọc thanh và lò xo nền của ETABS được **quy về lò xo nút** vì NexFEM chưa có phần tử nền đàn hồi. Chỉ nhận khi trục địa phương của lò xo trùng một trục tổng thể (thanh/sàn xiên: lỗi). Lò xo SAP2000 (`… SPRING ASSIGNMENTS`) báo lỗi vì chưa có file thật để kiểm chứng cú pháp.

## Tải tại nút

`Model.jointLoads` (mỗi tải: nút, mẫu tải, `values` = [Fx, Fy, Fz] kN và [Mx, My, Mz] kN·m theo hệ tổng thể, mô men theo quy tắc bàn tay phải). Bộ giải cộng vào vế phải của nút (cả mô men) và dừng với lỗi `lost_loads` nếu nút không nối với thanh nào, hoặc `invalid_joint_load` nếu tham chiếu sai. Gán bằng Assign ▸ **Tải tại nút…**; xoá nút thì xoá tải của nút; mẫu tải đang có tải nút không xoá được. Khung nhìn vẽ mũi tên theo hợp lực và ghi nhãn mô men khi hiển thị mẫu tải.

**Điểm riêng (không phải đầu thanh/sàn):** ETABS/SAP2000 tự chia thanh tại điểm nằm trên thanh. Bộ nhập định vị theo toạ độ (dung sai MERGETOL / MergeTol của file):

- Trùng một nút đã nhập: tải đặt lên nút đó (ghi chú).
- Điểm riêng chỉ có lực: bộ nhập đổi thành tải tập trung trên thanh (`globalX/Y/Z`) theo vị trí tương đối. Báo cáo ghi rõ cách chuyển đổi.
- Điểm riêng có mô men trong ETABS `.e2k`: khi điểm nằm trên trục của duy nhất một thanh có `AUTOMESH "YES"`, bộ nhập tạo nút nối hai đoạn và đặt cả sáu thành phần tải vào nút theo hệ tổng thể. Vị trí phải nằm trên trục thanh trong sai số số học và đủ xa các điểm chia khác theo `MERGETOL`. Giữ nhả liên kết ở hai đầu ngoài và chuyển tải thanh gốc sang các đoạn. Điểm giữa thanh mơ hồ, lệch trục hoặc trên thanh tắt tự chia được báo lỗi.
- Không thuộc trường hợp nào: lỗi.

Hỗ trợ mô men ở điểm riêng của ETABS áp dụng cho `POINTLOAD TYPE FORCE`. Việc nhập mô men gán trực tiếp lên thanh và mô men tại điểm riêng của SAP2000 còn trong kế hoạch. Tham chiếu [ETABS Joint Loads: Force](https://docs.csiamerica.com/help-files/etabs/Menus/Assign/Joint_Loads/Force.htm).

Test: `joint_forces_and_moments_in_global_axes` (bộ giải: công xôn với lực và mô men, phản lực cân bằng, lỗi mất tải, lỗi tham chiếu), `joint.assignLoad` (model-core), các test nhập file thật và dữ liệu tự tạo.

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
| Thanh | 322 | 322 | 87 thanh được chia thành 287 đoạn tại nút nằm trên thân thanh |
| Tiết diện thanh | 305 | 305 | 8 chữ L, 3 General |
| Sàn | 29 | 29 | 21 sàn móng có lò xo nền: quy về lò xo nút |
| Nút có lò xo | | 108 | tổng Kz = k_dọc_thanh·ΣL + k_nền·ΣA (test kiểm tra) |
| Tải thanh / tải sàn | 24 / 16 | 24 / 16 | 9 tải hình thang đổi thành tải đều |
| Tải tập trung tại nút | 31 | 31 | 8 tại nút đầu thanh; 23 ở điểm riêng nằm trên dầm, đổi thành tải tập trung trên dầm |
| Trường hợp tải / tổ hợp | 12 / 87 | 12 / 87 | |

Báo cáo nhập file ETABS mẫu **không còn lỗi**. Mô hình dùng lò xo nút thay cho gối, như file gốc. **F5 chạy được** (cân bằng lực đúng ở mọi trường hợp), với cảnh báo 8 bậc tự do mất ổn định không chịu tải được thêm độ cứng rất nhỏ, ví dụ nút 253 theo X (xem "Ổn định hoá cơ cấu"). Kết quả số **chưa dùng được** và **chưa so được với ETABS**:

- **Tải ngang (WX, WY, EX, EY):** chuyển vị hàng chục tới hàng trăm mét. Theo phương ngang, file gốc chỉ có lò xo nền ngang cực nhỏ (U1 = U2 = 8,68e-5 lb/in³, khoảng 1e-6 lần độ cứng đứng) và không có gối nào.
- **Tĩnh tải (CDL):** đã sửa bằng cách chia tấm tại nút nằm bên trong (xem "Lò xo nút"). Chân cột C3 (nút 57) giữa móng F17 nay nhận lò xo nền; lún lớn nhất 9,3 cm (trước 40,6 m).
- Lò xo nền và giằng chữ L tuyến tính, trong khi file gốc dùng lò xo chỉ chịu nén và giằng chỉ chịu kéo. Cột HSS nhồi bê tông được tính như ống rỗng.

Mô hình này đặt hầu hết đối tượng bằng DZ dưới một tầng duy nhất (Story1, cao 12 in), nên mặt bằng của tầng chỉ thấy những gì nằm đúng cao độ tầng. Xem bằng khung nhìn 3D hoặc mặt đứng.

## SAP2000 `.s2k` / `.$2k`

Báo cáo nhập phân loại các bảng tải nút/thanh/diện và tải động đất/gió tự động SAP2000 chưa hỗ trợ là **lỗi**. Khi báo cáo nhập CSI có lỗi, hộp thoại vẫn cho xem và sao chép báo cáo nhưng không mở mô hình; cần sửa nguồn hoặc chờ hỗ trợ. Quy tắc chặn lỗi áp dụng cho cả hai bộ nhập, không trộn thuật toán của ETABS và SAP2000. Các bảng chưa nhận diện ngoài nhóm trên vẫn cần rà soát; không coi bộ phân loại hiện nay là đầy đủ cho mọi tính năng CSI.

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
| `JOINT LOADS - FORCE` (GLOBAL: F1..F3, M1..M3) | tải nút `jointLoads`; hệ khác GLOBAL: lỗi | có |
| `JOINT LOADS - GROUND DISPLACEMENT` | **không nhập** (lỗi) | chưa |

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
| Không nhập được | không có | không có |
| Cảnh báo | liên kết nửa cứng M3 rất cứng (coi như ngàm), điểm chèn 8 của dầm | suy bán kính lượn W8X24 |

File OMF là khung phẳng YZ, hai cột xoay 90°: nhờ góc xoay, trục 2 của cột nằm trong mặt phẳng khung và cột uốn trong mặt phẳng quanh trục khoẻ I33, như SAP2000. Tải gió và động đất WY, EY là tải nút tại nút 1, đã nhập; mô hình nhập chạy F5 được.

## Kiểm thử

- `packages/io-formats/test/s2k-fixture.test.ts` (hai file SAP2000 thật và file `.sdb`): toàn vẹn byte, cú pháp (dòng nối, tiêu đề thiếu ngoặc kép), đơn vị, tầng từ trục Z, bậc tự do không hoạt động, gối, nhả liên kết và liên kết nửa cứng, tải thanh, tải sàn trên mặt None, tổ hợp lồng nhau, đặc trưng của mọi tiết diện so với bảng trong file, suy bán kính lượn, nhận diện `.sdb`, chọn nhầm mục.
- `packages/io-formats/test/e2k-fixture.test.ts` (file thật): toàn vẹn byte, số bản ghi theo ghi chú tiếp nhận, đơn vị, tầng, lưới, vật liệu, tiết diện, hướng cột, nhả liên kết, tải, tổ hợp lồng nhau, mã báo cáo, mô hình hợp lệ, nhập hai lần cho cùng kết quả.
- `packages/io-formats/test/e2k-synthetic.test.ts` (dữ liệu tự tạo, ghi rõ trong file): gối, nhiều tầng, gộp nút, đơn vị lạ, Windows-1252.
- `apps/desktop/src/services/csiImport.test.ts`: mọi mã báo cáo của cả hai bộ nhập có bản dịch tiếng Việt và tiếng Anh.
- `tests/e2e/specs/e2k-import.spec.ts`: menu con Nhập file, nhập file ETABS và SAP2000 thật qua menu, kiểm tra báo cáo, mở mô hình, F5 bị chặn vì thiếu gối (ETABS), F5 chạy được (SAP2000 OMF), Huỷ, file `.sdb`, chọn nhầm mục.
- `tests/e2e/specs/ui2.spec.ts`: sửa góc xoay trục trong Properties, gán tải tại nút.

## Việc tiếp theo

1. Phần tử shell có độ cứng (Giai đoạn 9); tới lúc đó tải mặt vẫn chia về thanh/nút biên theo diện tích chịu tải.
2. Phần tử nền đàn hồi cho thanh/sàn (thay cho quy lò xo về nút); lò xo SAP2000 khi có file thật; lò xo chỉ chịu nén (phân tích phi tuyến).
3. Nhập mô men gán trực tiếp trên thanh và mô men tại điểm riêng của SAP2000.
4. Đối chiếu kết quả (M2) khi có bảng chuyển vị, phản lực, nội lực xuất từ ETABS/SAP2000.

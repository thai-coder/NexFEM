# Giai đoạn 1 — Kiểm kê dữ liệu tham chiếu SAP2000

## Checkpoint

- Cập nhật: 17/11/2026, UTC+7. Trạng thái: REVIEW — hoàn thành kiểm kê theo phạm vi bên dưới; chưa nghiệm thu kết quả NexFEM.
- Nguồn: `thai-coder/NexFEM`, nhánh `main` tại `f2df3ae400910a3a07d693d620133ae0b2fd5924`, thư mục [`Analyze.Sap2000`](https://github.com/thai-coder/NexFEM/tree/f2df3ae400910a3a07d693d620133ae0b2fd5924/Analyze.Sap2000).
- Nhánh báo cáo: `codex/sap-phase1-inventory`, dựa trên nhánh ứng dụng `claude/etab-sap2000-connection-vts58p` tại `7669db8bb1f6d02e76feb6936627c9ce3518469c`. Các thay đổi đã stage trên worktree khác được giữ nguyên.
- Phạm vi: đọc mô hình `.s2k`, thống kê tên mọi bảng Excel tách riêng, đọc có chọn lọc đầu vào và kết quả cần cho việc xác lập dữ liệu chuẩn; phân biệt nguồn sai số. Không chạy bộ nhập hoặc bộ giải NexFEM; không sửa dữ liệu gốc; không mở workbook tổng.
- Hành động tiếp theo: Giai đoạn 2 — trên phiên bản nhánh ứng dụng được chốt, chạy nhập `.s2k`, lưu báo cáo chẩn đoán và đối chiếu từng nhóm với kiểm kê này; không tuyên bố đạt tương đương chỉ vì nhập xong. Trước so sánh kết quả phải xác nhận `.s2k` và các bảng Excel cùng trạng thái và lần chạy, đồng thời xem đầy đủ log/cảnh báo.
- Kiểm thử: kiểm tra cấu trúc, số dòng và case của các bảng được ghi dưới đây; chưa chạy CI, solver hay nghiệm thu Windows.

## 1. Nguồn và giới hạn

Mô hình `Platform 2nd use.s2k` là văn bản 6.601.634 byte, SHA-256 `60ee53086250bd226acf10c5ae7cdefee138ea49da83ef10dcdc4df1a528a013`; có 77 bảng `TABLE`, bao gồm định nghĩa mô hình và tải, không thấy bảng kết quả chuyển vị/nội lực/phản lực trong danh sách 77 bảng. Kết quả tham chiếu lấy từ Excel tách riêng, không tạo ra từ NexFEM.

`Program Control.xlsx` ghi SAP2000 26.2.0 và đơn vị hiện hành `Kip, in, F`. Từng bảng có hàng đơn vị riêng; dùng hàng đó khi so sánh. `.s2k` cũng ghi cùng tên phần mềm, phiên bản và hệ đơn vị. Giống nhau ở các thông tin và một số số lượng **không chứng minh** các tệp cùng một lần lưu/chạy; chưa có bằng chứng định danh bất biến nối mô hình với kết quả. Không suy ra tính chính xác thực tế của kết cấu từ việc SAP2000 chạy xong.

Bộ nguồn gốc chứa thông tin môi trường và trường giấy phép; không chép các trường đó hoặc log thô vào báo cáo mới. Tệp `.sdb`, `.$2k`, `.fmt` và `.LOG` hiện diện nhưng chưa được đối chiếu đầy đủ với `.s2k`; `.sdb` là nhị phân, không coi là đã đọc hiểu. LOG được quét chuỗi `WARNING`, `ERROR`, `UNSTABLE`, `SINGULAR` không thấy từ khóa, nhưng việc quét từ khóa **không thay thế đọc và xác nhận cảnh báo SAP2000**. `Analysis Messages.xlsx` chỉ thấy hai dòng loại Information, không chứng minh không có cảnh báo ngoài bảng xuất.

## 2. Dữ liệu mô hình đã kiểm kê

Số object trong `.s2k` và các bảng Excel đã xem khớp ở những nhóm sau; đếm dòng không phải đối chiếu đầy đủ từng thuộc tính.

| Nội dung | Quan sát | Bằng chứng |
|---|---|---|
| Frame object | 2.447 | `CONNECTIVITY - FRAME` trong `.s2k` |
| Area object | 77 | `CONNECTIVITY - AREA` trong `.s2k` |
| Nút gốc | 3.573 dòng dữ liệu | `Joint Coordinates.xlsx`, 3.576 dòng bao gồm tiêu đề và đơn vị |
| Gán nhả frame | 2.129 dòng | `.s2k`, `FRAME RELEASE ASSIGNMENTS 1 - GENERAL` |
| Gán độ cứng nhả từng phần | 2.126 dòng | `.s2k`, `FRAME RELEASE ASSIGNMENTS 2 - PARTIAL FIXITY` và Excel tương ứng; frame 1 có M2/M3 hai đầu bằng 10 kip-in/rad |
| Chia lưới frame | 6.008 dòng element | `Objects And Elements - Frames.xlsx`; frame 1 ánh xạ tới nhiều element |
| Chia lưới area | 1.015 dòng element | `Objects And Elements - Areas.xlsx` |
| Gán auto mesh | Có bảng cho frame và area | Frame 1 `AutoMesh=Yes`; area 1 `Points On Edges`; không kết luận tất cả có cùng cách chia |
| Tải diện | 24 dòng uniform và 124 dòng uniform to frame | Hai bảng `AREA LOADS` trong `.s2k`; có phân phối một phương ở các mẫu đã xem |
| Nguồn khối lượng | `MSSSRC1`: loads, 1 × DEAD | `MASS SOURCE`; chưa kiểm chứng toàn bộ khối lượng lắp ráp |

Có 4 pattern `DEAD`, `LIVE`, `EQX`, `EQY`. `DEAD` có hệ số tự trọng 1; ba pattern còn lại bằng 0. Bốn case tĩnh tuyến tính cùng tên có hệ số gán mẫu tải 1. `MODAL` là eigen, tối đa 12 mode. `EQX` và `EQY` có tải tự động ASCE 7-22. Những giá trị này là cấu hình mô hình, không phải sự xác nhận tiêu chuẩn đã áp dụng đúng.

`Auto Combo Data 02 - User Data.xlsx` có 6 dòng phân loại case cho thiết kế thép: 4 dòng Strength và 2 dòng Deflection. Bảng này **không trình bày các hệ số của từng tổ hợp cuối cùng**. `Pref Steel - AISC 360-22.xlsx` và `Over Steel - AISC 360-22.xlsx` là các đầu vào thiết kế/ghi đè; chưa xác định bảng kết quả thiết kế cấu kiện đầy đủ hay tổ hợp kiểm tra cuối cùng trong bộ này.

## 3. Kết quả SAP2000 có thể chuẩn bị làm tham chiếu

Các số dòng bên dưới đã đếm trực tiếp khi được ghi là “đếm”; dòng tiêu đề/đơn vị không tính. Tất cả đều **chưa đối chiếu với NexFEM** và chờ xác minh nguồn gốc cùng lần chạy.

| Bảng | Phạm vi quan sát | Khóa/đơn vị cần giữ |
|---|---|---|
| `Joint Displacements.xlsx` | Đếm 67.360 dòng: 4.210 mỗi case DEAD/LIVE/EQX/EQY và 50.520 MODAL | Joint, OutputCase, CaseType, StepType, StepNum, U1–U3 in, R1–R3 rad; các dòng kết quả gồm cả nút tính toán, không mặc định đồng nhất tập joint object gốc |
| `Joint Reactions.xlsx` | Đếm 4.960 dòng: 310 mỗi case tĩnh và 3.720 MODAL | Joint, case, step; F1–F3 kip, M1–M3 kip-in; cần xác minh trục liên quan trước khi so sánh |
| `Base Reactions.xlsx` | Có 4 case tĩnh và 12 dòng modal | GlobalFX/FY/FZ kip, GlobalMX/MY/MZ kip-in, tọa độ mốc mô men |
| `Element Forces - Frames.xlsx` | Kích thước khai báo 292.963 dòng gồm 3 dòng đầu; đã đọc cấu trúc và ví dụ đầu, **chưa đếm toàn bộ case** | Frame, Station, case/step, P/V2/V3 kip, T/M2/M3 kip-in, FrameElem, ElemStation; cần xác minh quy ước dấu và vị trí lấy mẫu |
| `Element Forces - Area Shells.xlsx` | Đếm 64.944 dòng: 4.059 mỗi case tĩnh và 48.708 MODAL | Area, AreaElem, Joint, case/step; F và V kip/in, M kip-in/in; kiểm tra trục và cách lấy/ghép giá trị tại nút element |
| `Auto Seismic Loads To Joints.xlsx` | Đếm 7.800 dòng: EQX 3.900, EQY 3.900 | Pattern, JointElem, Joint, lực, mô men, tọa độ; chưa kiểm toán thuật toán ASCE |
| `Objects And Elements - Frames/Areas.xlsx` | Bảng ánh xạ object → element đã đọc cấu trúc | Phải dùng khi ghép nội lực và lưới; không giả định ID object = ID element |

Ví dụ dữ liệu trực tiếp để định hướng, không phải kết quả NexFEM:

| Case | GlobalFX kip | GlobalFY kip | GlobalFZ kip |
|---|---:|---:|---:|
| DEAD | ≈ 0 | ≈ 0 | 846,915 |
| LIVE | ≈ 0 | ≈ 0 | 984,497 |
| EQX | −490,247 | ≈ 0 | ≈ 0 |
| EQY | ≈ 0 | −490,247 | ≈ 0 |

Ví dụ kiểm tra nhất quán nội bộ các **bảng xuất**: tổng F3 của 310 phản lực nút DEAD là 846,915 kip; LIVE là 984,4916058 kip so với GlobalFZ 984,497 kip. Chênh lệch nhỏ có thể liên quan độ chính xác số được xuất, nhưng chưa xác minh nguyên nhân. Không cộng trực tiếp mô men nút để so sánh mô men đáy khi chưa cộng thêm mô men do cánh tay đòn lực đối với cùng mốc.

Các bảng chuyển vị, phản lực và nội lực đã có dữ liệu thực nên có thể chuẩn bị làm nguồn chuẩn. Chưa được đưa các giá trị đã làm tròn vào `*.reference.json` như một bài test đạt/không đạt trước khi chốt nguồn, mapping và dung sai. Các file `Element Stresses`, `Modal Periods`, `Modal Participating Mass Ratios` và nhiều bảng khác hiện diện, nhưng lần kiểm kê này chưa đọc nội dung và không xác nhận dữ liệu chi tiết của chúng.

## 4. Sai số: ba câu hỏi khác nhau

1. **Sai số lý tưởng hóa/mô hình:** vật liệu, kích thước, điều kiện biên, liên kết thực được giả định thành ngàm/khớp hoặc lò xo, tải trọng và điều kiện thực. Ngàm/khớp là một giả thiết lý tưởng hóa; sai khác so với thực tế phụ thuộc từng công trình, không mặc định bằng một tỷ lệ cụ thể.
2. **Sai số rời rạc hóa và phương pháp số:** dạng phần tử, kích thước/chất lượng lưới, vị trí nút, công thức phần tử và hội tụ, cùng sai số làm tròn/số học. Mô hình liên tục bị xấp xỉ bằng hữu hạn phần tử; không thể suy ra sai số chỉ từ số element. Cần nghiên cứu hội tụ lưới và chú ý vùng kỳ dị, tải tập trung, gối hoặc gián đoạn.
3. **Sai khác giữa hai phần mềm:** chỉ có ý nghĩa khi thống nhất input, mesh, phần tử, trục, giả thiết, tùy chọn và vị trí lấy kết quả. Mục tiêu 1–2% áp dụng cho chỉ tiêu và trường hợp được xác định; gần 0 dùng dung sai tuyệt đối kèm đơn vị, và kiểm tra dấu. Không dùng ngưỡng 1–2% để khẳng định độ chính xác so với công trình thực hoặc cho mọi điểm/case.

Hội tụ lưới giải quyết câu hỏi xấp xỉ lời giải của **mô hình được chọn**, không tự xác nhận giả thiết ngàm, tải hay vật liệu sát thực tế. Muốn đánh giá thực tế cần thêm kiểm chứng độc lập phù hợp như nghiệm giải tích, thí nghiệm, đo đạc và đánh giá kỹ sư.

Khi nghiên cứu hội tụ: giữ nguyên hình học, tải, vật liệu và điều kiện biên; chạy ít nhất ba mức lưới có quy tắc tinh dần; ghi kích thước, chất lượng, số DOF/element, vị trí và đại lượng so sánh, chênh lệch giữa các mức, cân bằng và cảnh báo. Chỉ so sánh điểm tương ứng và giải thích các vùng kỳ dị; đánh giá riêng các ứng suất cục bộ. Bộ hiện tại chỉ xác nhận một cấu hình lưới, chưa có ba lần chạy để kết luận hội tụ.

## 5. Còn thiếu và hướng xử lý

- Xác nhận bằng chứng mô hình và các bảng xuất thuộc cùng lần chạy/cùng trạng thái; bảo đảm các kết quả không bị cũ sau sửa mô hình. Ghi ngày xuất và cài đặt chọn bảng khi có.
- Đọc các bảng còn lại theo nhu cầu, đặc biệt nội lực frame đầy đủ, thiết lập trục, offset, gối, chia lưới, kết quả shell/modal và các trường hợp thiết kế. Danh mục bên dưới phân biệt đã đọc với mới biết tên.
- Mô hình hiện chỉ có DEAD/LIVE/EQX/EQY và MODAL theo các bảng đã xem; chưa có kết quả gió được xác minh để dùng làm chuẩn. Không khẳng định toàn bộ thư mục không chứa thông tin gió.
- Muốn kiểm tra thiết kế thép cần xuất kết quả design chi tiết, combo chi phối và đầy đủ cài đặt/overwrites cho các cấu kiện được chọn. Chưa có cơ sở phát biểu thỏa/không thỏa từ các bảng thiết lập đã đọc.
- Chưa thiết lập benchmark sai số 1–2%, chưa chạy so sánh, chưa kiểm tra độ hội tụ của SAP2000 hay NexFEM; không suy diễn các khả năng còn lại của hai phần mềm.
- Nguồn tham khảo trong repo để đọc sâu khi triển khai: `manual/SAP2000 26/Manuals/CSI Analysis Reference Manual.pdf` và bộ verification/design tương ứng của SAP2000. Chỉ liệt kê nguồn, **chưa tuyên bố đã đọc hoặc áp dụng** tài liệu này trong giai đoạn 1.

## 6. Danh mục các file Excel được theo dõi

Danh mục bên dưới lấy từ cây Git tại SHA nguồn. `Đã đọc` nghĩa là đã mở workbook, đọc tiêu đề, đơn vị và ít nhất một dòng khi có dữ liệu; chỉ những bảng ghi rõ “đếm” ở mục 3 mới được đếm đầy đủ. `Chưa đọc` chỉ xác nhận tên tồn tại; không suy ra bảng có dữ liệu. SHA-256 là hash byte của workbook thực từ Git LFS, giúp phát hiện thay đổi; không chứng minh cùng lần chạy.

| File | Trạng thái | Số dòng khai báo | SHA-256 (workbook đã đọc) |
|---|---|---:|---|
| `Active Degrees of Freedom.xlsx` | Chưa đọc | — | — |
| `Analysis Messages.xlsx` | Đã đọc | 5 | `28c94394fa8caef6fa0ff6ddefa40e45016b163e9f39cc895d0f7344624affd7` |
| `Analysis Options.xlsx` | Chưa đọc | — | — |
| `Area Auto Mesh Assignments.xlsx` | Đã đọc | 80 | `a853984e68995d9981c5969bc5a62aa097847ac6fbaa1968c5544793b949d1c3` |
| `Area Design Procedures.xlsx` | Chưa đọc | — | — |
| `Area Loads - Uniform To Frame.xlsx` | Chưa đọc | — | — |
| `Area Loads - Uniform.xlsx` | Chưa đọc | — | — |
| `Area Section Assignments.xlsx` | Chưa đọc | — | — |
| `Area Section Prop Design Params.xlsx` | Chưa đọc | — | — |
| `Area Section Prop TimeDependent.xlsx` | Chưa đọc | — | — |
| `Area Section Properties.xlsx` | Chưa đọc | — | — |
| `Assembled Joint Masses.xlsx` | Chưa đọc | — | — |
| `Auto Combo Data 01 - General.xlsx` | Chưa đọc | — | — |
| `Auto Combo Data 02 - User Data.xlsx` | Đã đọc | 9 | `d50146d3ea5878aeb5e08546ce37a4e534c9e960c3ffe5c510558603583ed57f` |
| `Auto Seismic - ASCE 7-22.xlsx` | Chưa đọc | — | — |
| `Auto Seismic Loads To Joints.xlsx` | Đã đọc | 7803 | `79281a09be2a77b04060a3a49f211641c049fb25b8f36583db3d696483fe4e6d` |
| `Auto Wave 3 - Char - General.xlsx` | Chưa đọc | — | — |
| `Base Reactions.xlsx` | Đã đọc | 19 | `b956de64066308caf0df4855edf75b5e3d43f0f88519b8618eb962baba3b6be8` |
| `Case - Modal 1 - General.xlsx` | Đã đọc | 4 | `4469f67c8f5f91829613bc98a72e38440539bf87bf83741dca571faabf97712b` |
| `Case - Static 1 - Load Assigns.xlsx` | Chưa đọc | — | — |
| `Connectivity - Area.xlsx` | Chưa đọc | — | — |
| `Connectivity - Frame.xlsx` | Chưa đọc | — | — |
| `Coordinate Systems.xlsx` | Chưa đọc | — | — |
| `Database Format Types.xlsx` | Chưa đọc | — | — |
| `Element Forces - Area Shells.xlsx` | Đã đọc | 64947 | `1bd15f24efeafb85c7e8070181e66d3d20e67a28221ffb9be94909d187146823` |
| `Element Forces - Frames.xlsx` | Đã đọc | 292963 | `2c31ea642497cd22a7a3d72c076084cdf737ddaa7242d018a0813c56401d48bb` |
| `Element Joint Forces - Areas.xlsx` | Chưa đọc | — | — |
| `Element Joint Forces - Frames.xlsx` | Chưa đọc | — | — |
| `Element Soil Pres - Area Shells.xlsx` | Chưa đọc | — | — |
| `Element Strains - Area Shells.xlsx` | Chưa đọc | — | — |
| `Element Stresses - Area Shells.xlsx` | Chưa đọc | — | — |
| `Element Stresses - Frames.xlsx` | Chưa đọc | — | — |
| `Frame Auto Mesh.xlsx` | Đã đọc | 2450 | `c244fc2478e908688a1de474d863da341bf60d473cb540e12ee44b3792bcf017` |
| `Frame Design Procedures.xlsx` | Chưa đọc | — | — |
| `Frame Insertion Point Assigns.xlsx` | Chưa đọc | — | — |
| `Frame Load Transfer Options.xlsx` | Đã đọc | 2450 | `91b0dc91dc9c2a4ca65c5ef3dfaed6a1b5818ba6761ce33f38cde78dbabf94d8` |
| `Frame Local Axes 1 - Typical.xlsx` | Chưa đọc | — | — |
| `Frame Offset (Length) Assigns.xlsx` | Chưa đọc | — | — |
| `Frame Output Station Assigns.xlsx` | Chưa đọc | — | — |
| `Frame Props 01 - General.xlsx` | Chưa đọc | — | — |
| `Frame Props 13 - Time Dependent.xlsx` | Chưa đọc | — | — |
| `Frame Releases 1 - General.xlsx` | Chưa đọc | — | — |
| `Frame Releases 2 - Part Fixity.xlsx` | Đã đọc | 2129 | `43de08558f0b39f77016f392766c0d58abf1e0a00e4191e3f23746fa6bd26970` |
| `Frame Section Assignments.xlsx` | Chưa đọc | — | — |
| `Function - PSD - User.xlsx` | Chưa đọc | — | — |
| `Function - Plot Functions.xlsx` | Chưa đọc | — | — |
| `Function - Resp Spect - User.xlsx` | Chưa đọc | — | — |
| `Function - Steady State - User.xlsx` | Chưa đọc | — | — |
| `Function - Time History - User.xlsx` | Chưa đọc | — | — |
| `GenRefLine 01 - General.xlsx` | Chưa đọc | — | — |
| `GenRefLine 02 - Plan Points.xlsx` | Chưa đọc | — | — |
| `GenRefLine 03 - Elev Points.xlsx` | Chưa đọc | — | — |
| `GenRefLine 04 - Disc Coords.xlsx` | Chưa đọc | — | — |
| `Grid Lines.xlsx` | Chưa đọc | — | — |
| `Groups 1 - Definitions.xlsx` | Chưa đọc | — | — |
| `Groups 3 - Masses and Weights.xlsx` | Chưa đọc | — | — |
| `Joint Coordinates.xlsx` | Đã đọc | 3576 | `fe389a6b6aac1e5732a30d4cf6a944f3507395fbad7a1ac0685de6875ce4c0d5` |
| `Joint Displacements.xlsx` | Đã đọc | 67363 | `6884048ba7708f7eddd42210ed43542a5d1a54b42fb839812a2d9e52975ecceb` |
| `Joint Pattern Definitions.xlsx` | Chưa đọc | — | — |
| `Joint Reactions.xlsx` | Đã đọc | 4963 | `79133e985c355f289dcbd6596b719e390df4856f9655321f7e4a8dfbe304a38a` |
| `Joint Restraint Assignments.xlsx` | Chưa đọc | — | — |
| `Link Props 01 - General.xlsx` | Chưa đọc | — | — |
| `Link Props 02 - Linear.xlsx` | Chưa đọc | — | — |
| `Load Case Definitions.xlsx` | Chưa đọc | — | — |
| `Load Pattern Definitions.xlsx` | Đã đọc | 7 | `4a03344b0c087fd009e885fe97da92abc86adf6649021c1982e12658ae32c80d` |
| `Mass Source.xlsx` | Chưa đọc | — | — |
| `MatProp 01 - General.xlsx` | Chưa đọc | — | — |
| `MatProp 02 - Basic Mech Props.xlsx` | Chưa đọc | — | — |
| `MatProp 03a - Steel Data.xlsx` | Chưa đọc | — | — |
| `MatProp 03b - Concrete Data.xlsx` | Chưa đọc | — | — |
| `MatProp 03e - Rebar Data.xlsx` | Chưa đọc | — | — |
| `MatProp 03f - Tendon Data.xlsx` | Chưa đọc | — | — |
| `MatProp 03j - Von Mises Data.xlsx` | Chưa đọc | — | — |
| `MatProp 06 - Damping Parameters.xlsx` | Chưa đọc | — | — |
| `MatProp 09 - Acceptance.xlsx` | Chưa đọc | — | — |
| `Material List 1 - By Obj Type.xlsx` | Chưa đọc | — | — |
| `Material List 2 - By Sect Prop.xlsx` | Chưa đọc | — | — |
| `Modal Load Participation Ratios.xlsx` | Chưa đọc | — | — |
| `Modal Participating Mass Ratios.xlsx` | Chưa đọc | — | — |
| `Modal Participation Factors.xlsx` | Chưa đọc | — | — |
| `Modal Periods And Frequencies.xlsx` | Chưa đọc | — | — |
| `Objects And Elements - Areas.xlsx` | Đã đọc | 1018 | `7df3d27419c90ca16f5a4b50e376de702c7bc862d67a3a8fb7815d09f3537cea` |
| `Objects And Elements - Frames.xlsx` | Đã đọc | 6011 | `79e5add38059ed5cdc218afd6a72a63f3c8af93f75d1c15f41106bdc31075e16` |
| `Objects And Elements - Joints.xlsx` | Chưa đọc | — | — |
| `Options - Colors - Display.xlsx` | Chưa đọc | — | — |
| `Options - Colors - Output.xlsx` | Chưa đọc | — | — |
| `Over Steel - AISC 360-22.xlsx` | Đã đọc | 2450 | `395669a84bf6ad5c8118fb70d7b440fe0b15bf2cdfccab4a4a391280bdc962c5` |
| `Pref - Alum - AA 2015.xlsx` | Chưa đọc | — | — |
| `Pref - Cold - AISI-16.xlsx` | Chưa đọc | — | — |
| `Pref - Conc - ACI 318-19.xlsx` | Chưa đọc | — | — |
| `Pref - ConcSh - Eurocode 2-2004.xlsx` | Chưa đọc | — | — |
| `Pref Steel - AISC 360-22.xlsx` | Đã đọc | 4 | `6f2d732c5bd5d29c24dd36913772d8f2fed4ba6f1ef94ea70803be67f7370bd4` |
| `Preferences - Dimensional.xlsx` | Chưa đọc | — | — |
| `Program Control.xlsx` | Đã đọc | 4 | `a28650e0511047539f982448208f3bf117b508af9f7474212c63c1066f832ff7` |
| `Project Information.xlsx` | Chưa đọc | — | — |
| `Rebar Sizes.xlsx` | Chưa đọc | — | — |
| `Solid Property Definitions.xlsx` | Chưa đọc | — | — |

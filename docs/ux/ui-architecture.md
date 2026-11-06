# Thiết kế UX/UI & kiến trúc thư mục — App phân tích kết cấu kiểu ETABS

Nov 6, 2026 · @Thái Lê

## Tóm tắt và công nghệ đề xuất

Ứng dụng là phần mềm desktop phân tích kết cấu kiểu ETABS: một cửa sổ chính gồm viewport đa khung nhìn (2D/3D), cây mô hình bên trái, bảng thuộc tính bên phải, console và bảng kết quả ở dưới. Mình không tìm thấy kế hoạch cũ trong project này, nên tài liệu dùng một bộ công nghệ mặc định; Thái chỉ cần báo nếu muốn đổi.

| Lớp | Lựa chọn mặc định | Lý do |
| --- | --- | --- |
| Vỏ desktop | Tauri 2 (Windows/macOS/Linux) | Nhẹ hơn Electron, backend Rust gọi solver trực tiếp |
| Giao diện | React 18 + TypeScript + Vite | Hệ sinh thái lớn, dễ tuyển người |
| Khung docking | Dockview (hoặc FlexLayout) | Kéo thả, tách panel như ETABS |
| Trạng thái | Zustand + Immer, lệnh Undo/Redo theo Command pattern | Mô hình lớn vẫn kiểm soát được |
| 3D | Three.js qua react-three-fiber, InstancedMesh cho phần tử | Hàng chục nghìn thanh vẫn mượt |
| 2D (mặt bằng, mặt đứng) | Dùng chung Three.js với camera trực giao; xuất bản vẽ bằng SVG | Một engine cho cả 2D và 3D |
| Bảng dữ liệu | AG Grid Community hoặc TanStack Table + ảo hóa | Bảng kết quả hàng trăm nghìn dòng |
| Solver | Rust (nalgebra/faer, sparse solver), chạy native qua Tauri; bản WASM cho web sau này | Nhanh, an toàn bộ nhớ |
| File dự án | `.nxf` = thư mục nén chứa JSON mô hình + kết quả nhị phân | Dễ diff, dễ mở rộng |

Nếu Thái thích Python hơn, phương án thay thế là PySide6 (Qt) + VTK/PyVista + solver NumPy/SciPy; cây thư mục ở cuối sẽ đổi theo.

## Bố cục màn hình chính

Màn hình chính chia 5 vùng cố định quanh viewport trung tâm; mọi panel đều dock được, ẩn/hiện bằng phím tắt và lưu layout theo người dùng.

```
┌─ Title bar: NexFEM — Toa_nha_A.nxf  [đơn vị: kN, m, C ▾] ─────────────────────────────┐
│ File  Edit  View  Define  Draw  Select  Assign  Analyze  Display  Design  Tools  Help │
├─ Ribbon / Toolbar ──────────────────────────────────────────────────────────────────┤
│ [New][Open][Save] | [Undo][Redo] | [Select][Node][Beam][Column][Brace][Slab][Wall]   │
│ | [Snap▾] | [Plan][Elev][3D] | [Story: Tầng 3 ▲▼] | [▶ Run] | [Deformed][M][V][N]  │
├──────────────────┬───────────────────────────────────────────────┬────────────────────┤
│ MODEL EXPLORER   │ ┌─ Plan View – Tầng 3 ────────┬─ 3D View ─────────────┐ │ PROPERTIES         │
│ [Model|Display|  │ │  A     B     C     D      │        /\              │ │ Frame F124         │
│  Tables]         │ │ 1+─────+─────+─────+     │      /    \  ┌──┐      │ │ ─ General ─────    │
│ ▾ Project       │ │  │     │     │     │     │     │ ╔══╗ │  │      │ │ Label     B12      │
│   ▸ Grids       │ │ 2+─────+═════+─────+     │     │ ║  ║ │  │      │ │ Story     Tầng 3   │
│   ▸ Stories     │ │  │     │ sel │     │     │      \ ╚══╝ /       │ │ Section   D300x600 │
│ ▾ Properties    │ │ 3+─────+─────+─────+     │        \/              │ │ Material  B25      │
│   ▸ Materials   │ │      x→  y↑                 │  [Perspective ▾] [⌖]   │ │ ─ Geometry ────    │
│   ▸ Sections    │ ├─ Elevation – Trục B ────────┴─ Section Cut ──────────┤ │ Length    6.000 m  │
│   ▸ Load Pat.   │ │  (khung nhìn 3/4 tùy chọn: 1, 2, 4 ô)              │ │ ─ Assigns ─────    │
│   ▸ Load Cases  │ │                                                │ │ Releases  None     │
│   ▸ Combos      │ │                                                │ │ Loads     DL, LL → │
│ ▾ Objects       │ └───────────────────────────────────────────────┘ │ [Apply] [Revert]   │
│   ▸ Joints (412)│                                                    │                    │
│   ▸ Frames(980) │                                                    │                    │
│   ▸ Shells(120) │                                                    │                    │
├──────────────────┴───────────────────────────────────────────────┴────────────────────┤
│ [Console] [Messages ⚠3] [Results Table] [Analysis Log]                                  │
│ > Analysis complete: 412 joints, 2472 DOF, 0.84 s. Max drift 1/612 (Tầng 5).          │
├─ Status bar ─────────────────────────────────────────────────────────────────────┤
│ X 12.000  Y 6.000  Z 9.600 | Snap: Grid+End | 3 đối tượng chọn | ● Model unlocked | kN,m │
└────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Vị trí | Kích thước mặc định | Phím ẩn/hiện |
| --- | --- | --- | --- |
| Menu + Ribbon | Trên cùng | 2 hàng, \~96 px | Ctrl+F1 thu gọn ribbon |
| Model Explorer | Trái | 260 px | F2 |
| Viewport | Giữa | Phần còn lại, 1/2/4 ô | Ctrl+1/2/4 |
| Properties | Phải | 300 px | F4 |
| Console / Tables | Dưới | 180 px, kéo được | F8 |
| Status bar | Dưới cùng | 24 px | luôn hiện |

Tên sản phẩm: NexFEM (theo repo).

## Các thành phần giao diện

Mỗi thành phần đọc và ghi cùng một kho mô hình (model store), nên chọn ở viewport thì cây, bảng thuộc tính và bảng dữ liệu cùng tô sáng ngay.

### Menu chính

| Menu | Nội dung chính |
| --- | --- |
| File | New (từ template lưới), Open, Save, Import (DXF, IFC, Excel), Export (bản vẽ, bảng), Print, Recent |
| Edit | Undo/Redo, Copy/Paste, Replicate (linear, radial, mirror, story), Divide, Merge joints, Delete |
| View | 2D/3D, Set view options, Zoom, Pan, Rotate, Show/hide panel, Layout 1/2/4 ô |
| Define | Grids, Stories, Materials, Frame/Shell sections, Load patterns, Load cases, Combos, Mass source, Diaphragms, Response spectrum |
| Draw | Joint, Frame (beam, column, brace), Slab/Wall polygon, Quick draw theo lưới, Dimension |
| Select | By window/crossing, by property, by story, by group, Invert, Previous |
| Assign | Joint (restraint, spring, load), Frame (section, release, load, local axes), Shell (section, load, mesh), Group |
| Analyze | Check model, Set DOF, Run (F5), Run options, Unlock model |
| Display | Deformed shape, Force diagrams (M, V, N, T), Shell stresses, Mode shapes, Story response, Animation |
| Design | Concrete frame design (TCVN 5574, ACI, EC2), Steel design, Design results (giai đoạn sau) |
| Tools | Units, Preferences, Shortcut editor, Plugin manager, Script console |

### Ribbon / Toolbar

- Nhóm theo ngữ cảnh: tab Modeling, Loads, Analysis, Results, Design; tab hiện tại đổi theo bước làm việc.
- Công cụ vẽ là nút bật tắt (modal): đang vẽ Beam thì nút sáng, Esc về Select.
- Ô chọn tầng (Story) có nút ▲▼ và tuỳ chọn “One story / Similar stories / All stories” như ETABS.
- Ô chọn trường hợp tải/tổ hợp hiện kết quả (chỉ bật sau khi phân tích).

### Model Explorer (cây mô hình)

- Ba tab: **Model** (định nghĩa + đối tượng), **Display** (các view đã lưu, nhóm hiển thị), **Tables** (danh mục bảng nhập/xuất).
- Click: chọn đối tượng và hiện trong Properties. Double-click: mở hộp thoại định nghĩa. Chuột phải: Add, Duplicate, Rename, Delete, Show in view.
- Ô tìm kiếm ở đầu cây, lọc theo tên hoặc nhãn (vd. `B12`, `D300`).
- Số đếm bên cạnh nhóm, biểu tượng cảnh báo khi định nghĩa chưa dùng hoặc bị thiếu.

### Viewport

- 1, 2 hoặc 4 ô; mỗi ô có thanh tiêu đề ghi loại view (Plan Tầng 3, Elevation Trục B, 3D) và trường hợp đang hiển thị.
- Ô đang hoạt động có viền màu nhấn; lệnh vẽ và phím tắt tác động vào ô đó.
- Góc dưới: trục toạ độ XYZ; góc trên phải: view cube (3D) hoặc nút chuyển mặt phẳng (2D).
- Tooltip khi rê chuột lên phần tử: nhãn, tiết diện, giá trị nội lực (khi có kết quả).

### Properties panel

- Hiện thuộc tính của việc chọn hiện tại; chọn nhiều đối tượng thì ô khác giá trị ghi `<varies>`.
- Nhóm gập: General, Geometry, Assigns, Loads, Results (chỉ đọc).
- Sửa trực tiếp, Apply ghi một lệnh undo; trường lỗi viền đỏ kèm lý do.
- Khi mô hình bị khóa sau phân tích, panel chuyển chỉ đọc với nút “Unlock để sửa”.

### Khu vực dưới (Console / Tables)

- **Console**: nhật ký lệnh, cho gõ lệnh nhanh kiểu CAD (`beam 0,0 6,0`), sau này là script.
- **Messages**: cảnh báo và lỗi kiểm tra mô hình, click để nhảy tới phần tử.
- **Results Table**: bảng ảo hóa, lọc theo tầng/trường hợp, xuất Excel/CSV; chọn dòng thì tô sáng phần tử trong view.
- **Analysis Log**: tiến trình solver theo thời gian thực.

### Status bar

Toạ độ con trỏ, chế độ bắt điểm, số đối tượng đang chọn, trạng thái khóa mô hình, đơn vị hiện hành (click để đổi).

## Luồng làm việc chính

Người dùng đi theo 7 bước từ trái sang phải, rồi lặp lại qua bước “Mở khóa” mỗi khi sửa mô hình; ribbon tự chuyển tab theo bước đang làm.

```
1. Tạo mô hình → 2. Định nghĩa → 3. Vẽ → 4. Gán → 5. Kiểm tra → 6. Chạy (khóa) → 7. Kết quả
                          ▲                                              │
                          └──────────── Mở khóa (F6), xóa kết quả ◄──────┘
```

Sau khi chạy, mô hình bị khóa để kết quả luôn khớp với hình học; muốn sửa phải mở khóa, kết quả cũ bị xóa, rồi quay lại bước vẽ.

| Bước | Người dùng làm | Giao diện phản hồi |
| --- | --- | --- |
| 1. Tạo mô hình | Chọn template, nhập trục và tầng | Plan + 3D hiện lưới ngay |
| 2. Định nghĩa | Thêm vật liệu, tiết diện, load pattern/case/combo | Mục mới xuất hiện trong Model Explorer |
| 3. Vẽ | Chọn công cụ, click theo lưới; Properties hiện tiết diện sẽ gán | Xem trước nét vẽ, bắt điểm, độ dài tại con trỏ |
| 4. Gán | Chọn phần tử → Assign | Biểu tượng gối, mũi tên tải trên view |
| 5. Kiểm tra | Analyze → Check model | Danh sách lỗi, click nhảy tới phần tử |
| 6. Chạy | F5, chọn case | Thanh tiến trình + Analysis Log; biểu tượng khóa trên status bar |
| 7. Kết quả | Chọn case/combo, loại biểu đồ | Biểu đồ trên view, Results Table, chọn dòng ↔ tô sáng phần tử |

## Các màn hình và hộp thoại then chốt

Giai đoạn UI đầu tiên cần 10 màn hình dưới đây; các hộp thoại định nghĩa dùng chung một khuôn “danh sách bên trái, form bên phải”.

| # | Màn hình | Nội dung | Ghi chú UX |
| --- | --- | --- | --- |
| 1 | Start / New Model | Recent files, template (khung BTCT, nhà thép, trống), đơn vị, quy chuẩn | Mở lên là vẽ được trong < 3 click |
| 2 | Grid & Story wizard | Bảng trục X/Y (tên, khoảng cách), bảng tầng (tên, cao độ, master/similar) | Xem trước lưới ngay bên cạnh |
| 3 | Define Materials | Danh sách vật liệu + form E, ν, γ, f'c/fy; thư viện B15–B60, CB300–CB500 | Nhập từ thư viện TCVN sẵn |
| 4 | Define Frame Sections | Danh sách + form theo hình dạng (chữ nhật, I, hộp, tròn), đặc trưng hình học tính tự động | Vẽ tiết diện xem trước tỉ lệ thật |
| 5 | Define Shell Sections | Slab/Wall, chiều dày, loại (shell thin/thick, membrane) |  |
| 6 | Load Patterns / Cases / Combos | Ba tab: pattern (DL, SDL, LL, WX, EQX…), case (linear static, modal, RS), tổ hợp với hệ số | Tạo tổ hợp tự động theo TCVN 2737 |
| 7 | Assign dialogs | Restraint (6 ô tích + preset ngàm/khớp/lăn), Frame load (phân bố/tập trung), Shell load | Áp dụng lên việc chọn hiện tại, không đóng hộp thoại |
| 8 | Run Analysis | Chọn case cần chạy, thanh tiến trình, log, nút Cancel | Kiểm tra mô hình trước khi chạy |
| 9 | Results Viewer | Biểu đồ M/V/N trên view, thang màu, thanh trượt mode, bảng kết quả | Click thanh → hộp chi tiết biểu đồ nội lực |
| 10 | Preferences | Đơn vị, màu, phím tắt, ngôn ngữ (VI/EN), độ chính xác số |  |

Khuôn hộp thoại định nghĩa (dùng cho màn 3, 4, 5, 6):

```
┌─ Define Frame Sections ─────────────────────────────────────────┐
│ [🔍 lọc...]          │ Name      [D300x600        ]               │
│ ▸ C400x400          │ Material  [B25          ▾]               │
│ ▸ C500x500          │ Shape     (●) Rect ( ) I ( ) Box ( ) Pipe   │
│ ▶ D300x600  ◀       │ b [0.300] m   h [0.600] m     ┌─────┐      │
│ ▸ D220x400          │                               │     │      │
│                     │ A   0.180 m²                  │     │      │
│ [+ Add] [Copy] [Del]│ I33 5.40e-3 m⁴                └─────┘      │
│                     │ [Modifiers...]  [Reinforcement...]          │
├─────────────────────┴───────────────────────────────────────────────┤
│                                        [OK] [Cancel] [Apply]  │
└───────────────────────────────────────────────────────────────┘
```

## Design system: màu, phím tắt, chuột

Giao diện mặc định là nền tối (đỡ mỏi mắt khi làm lâu, làm nổi hình), có theme sáng để in ấn; màu phần tử theo quy ước cố định để nhìn là biết loại.

### Màu quy ước trong viewport

| Đối tượng | Màu (theme tối) |
| --- | --- |
| Nền viewport | #1E1F22 |
| Lưới trục | xám #4A4D52, tên trục trong bong bóng tròn |
| Cột | cam #E8A33D |
| Dầm | xanh dương #4C9AFF |
| Giằng | tím #B07CFF |
| Sàn | xanh lá nhạt, trong suốt 40% |
| Vách | xanh ngọc, trong suốt 60% |
| Đang chọn | vàng #FFD400, nét đứt |
| Hover | viền trắng mảnh |
| Biểu đồ nội lực | dương đỏ, âm xanh; thang màu liên tục cho ứng suất shell |

Màu UI (panel, nút, chữ) khai báo bằng design token (`--color-surface`, `--color-accent`…) để đổi theme không phải sửa component. Font giao diện Inter 13 px, số liệu dùng font monospace căn phải.

### Phím tắt cơ bản

| Phím | Lệnh |
| --- | --- |
| Esc | Thoát lệnh, về Select |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Del | Xóa đối tượng chọn |
| F5 | Run analysis |
| F6 | Unlock model |
| B / C / R / S / W | Vẽ Beam / Column / bRace / Slab / Wall |
| Ctrl+1 / 2 / 4 | Layout 1 / 2 / 4 ô view |
| Page Up / Down | Lên / xuống tầng trong Plan view |
| F2 / F4 / F8 | Ẩn hiện Explorer / Properties / Console |
| Ctrl+Shift+P | Command palette (tìm mọi lệnh theo tên) |

### Chuột trong viewport

- Chuột giữa kéo: pan. Lăn: zoom quanh con trỏ. Shift + chuột giữa (3D): xoay quanh tâm chọn.
- Kéo trái → phải: chọn cửa sổ (nằm trọn). Kéo phải → trái: chọn cắt (crossing). Ctrl+click: thêm/bớt khỏi việc chọn.
- Chuột phải: menu ngữ cảnh theo loại đối tượng (Assign, Properties, Show results).
- Bắt điểm: giao lưới, đầu mút, trung điểm, giao điểm, vuông góc; biểu tượng snap hiện ngay tại con trỏ.

## Cây thư mục dự án

Dự án là một monorepo: `apps/` chứa các ứng dụng chạy được, `packages/` chứa thư viện TypeScript dùng chung, `crates/` chứa lõi tính toán Rust. Quy tắc phụ thuộc chỉ đi một chiều: `ui` → `viewer` → `model-core`; `model-core` không biết gì về React hay Three.js, nên sau này thay giao diện hoặc chạy headless vẫn dùng lại được.

```
nexfem/
├── apps/
│   ├── desktop/                    # Ứng dụng Tauri (đóng gói .exe/.dmg)
│   │   ├── src/                    # Frontend React của app
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx             # Dựng khung docking + nạp workspace
│   │   │   ├── shell/              # Khung cửa sổ: TitleBar, MenuBar, Ribbon, StatusBar, DockLayout
│   │   │   ├── panels/             # Các panel dock được
│   │   │   │   ├── model-explorer/
│   │   │   │   ├── properties/
│   │   │   │   ├── console/
│   │   │   │   ├── messages/
│   │   │   │   ├── results-table/
│   │   │   │   └── viewport/       # Vỏ bọc viewer, layout 1/2/4 ô
│   │   │   ├── dialogs/            # Hộp thoại theo menu
│   │   │   │   ├── define/         # grids, stories, materials, sections, loads, combos
│   │   │   │   ├── assign/         # restraints, releases, frame-loads, shell-loads
│   │   │   │   ├── analyze/        # run-analysis, check-model
│   │   │   │   └── settings/       # preferences, units, shortcuts
│   │   │   ├── tools/              # Công cụ tương tác: select, draw-beam, draw-column, draw-slab...
│   │   │   ├── commands/           # Đăng ký lệnh menu/phím tắt/command palette
│   │   │   ├── stores/             # Zustand: selection, ui-layout, active-view, app-settings
│   │   │   ├── services/           # Cầu nối Tauri: file-io, solver-bridge, updater
│   │   │   └── i18n/               # vi.json, en.json
│   │   └── src-tauri/              # Backend Rust của Tauri
│   │       ├── src/commands/       # open_project, save_project, run_analysis...
│   │       └── tauri.conf.json
│   └── docs-site/                  # (sau) Tài liệu người dùng
│
├── packages/
│   ├── ui/                         # Design system: Button, Input, NumberField(đơn vị), Tree, Grid, Dialog, Icon
│   │   ├── tokens/                 # màu, spacing, font; theme dark/light
│   │   └── components/
│   ├── model-core/                 # Mô hình kết cấu thuần TS, không phụ thuộc UI
│   │   ├── entities/               # Joint, Frame, Shell, Grid, Story, Material, Section, LoadPattern...
│   │   ├── commands/               # Thao tác có Undo/Redo: AddFrame, AssignSection, Replicate...
│   │   ├── validation/             # Kiểm tra mô hình: nút trùng, thanh trùng, thiếu gối
│   │   ├── units/                  # Chuyển đổi đơn vị
│   │   └── serialization/          # Đọc/ghi .nxf, schema + migration theo version
│   ├── viewer/                     # Render 2D/3D (Three.js), không phụ thuộc React
│   │   ├── scene/                  # Chuyển model → scene graph, InstancedMesh
│   │   ├── views/                  # PlanView, ElevationView, View3D, SectionCut
│   │   ├── camera/                 # Trực giao/phối cảnh, view cube, zoom extents
│   │   ├── picking/                # Chọn đối tượng (GPU picking), window/crossing
│   │   ├── snapping/               # Bắt điểm lưới, đầu mút, trung điểm
│   │   ├── overlays/               # Trục, nhãn, kích thước, biểu tượng gối/tải
│   │   └── results/                # Biểu đồ M/V/N, biến dạng, contour shell, animation mode
│   ├── analysis-client/            # API TS gọi solver (native qua Tauri hoặc WASM), kiểu kết quả
│   ├── tables/                     # Định nghĩa bảng nhập/xuất (cột, đơn vị, lọc), xuất Excel/CSV
│   └── io-formats/                 # (sau) Import/Export DXF, IFC, Excel
│
├── crates/                         # Lõi tính toán Rust (Cargo workspace)
│   ├── fem-core/                   # Phần tử frame 3D, shell, lắp ghép ma trận độ cứng
│   ├── fem-solver/                 # Giải tuyến tính (sparse), modal (eigen), response spectrum
│   ├── fem-mesh/                   # Chia lưới sàn/vách
│   ├── fem-post/                   # Nội lực, chuyển vị, drift tầng, phản lực
│   ├── design-codes/               # (sau) TCVN 5574, ACI 318, EC2/EC3
│   └── fem-wasm/                   # Bindings WASM cho bản web
│
├── resources/
│   ├── libraries/                  # Thư viện vật liệu, tiết diện thép (JSON)
│   ├── templates/                  # Template mô hình mới
│   └── icons/                      # Icon SVG toolbar
│
├── tests/
│   ├── benchmarks/                 # Bài toán mẫu có đáp án (so với SAP2000/ETABS, sách)
│   └── e2e/                        # Playwright: kịch bản vẽ → chạy → xem kết quả
├── docs/
│   ├── adr/                        # Ghi nhận quyết định kiến trúc
│   ├── ux/                         # Wireframe, luồng, tài liệu này
│   └── theory/                     # Ghi chú công thức phần tử hữu hạn
├── scripts/                        # build, release, sinh icon
├── package.json  pnpm-workspace.yaml  turbo.json
├── Cargo.toml                      # Cargo workspace cho crates/ và src-tauri
└── README.md
```

Mỗi panel/dialog là một thư mục tự chứa (`index.tsx`, `*.module.css`, `use*.ts`, `*.test.tsx`), nên thêm màn hình mới không đụng chỗ khác. Ba module Thái nhắc tới đã có chỗ: view 2D/3D trong `packages/viewer`, luồng phân tích trong `crates/` + `packages/analysis-client`, hiển thị kết quả trong `packages/viewer/results`.

## Lộ trình tiếp theo

Thứ tự đề xuất bám đúng ý Thái: UI trước, sau đó mới đến hiển thị 2D/3D và luồng xử lý.

1. **UI shell**: dựng monorepo, khung docking, menu, ribbon, Model Explorer, Properties, Console, theme, phím tắt; dữ liệu giả.
2. **Hộp thoại Define**: Grid/Story, Materials, Sections, Load patterns/cases/combos nối vào `model-core` với Undo/Redo và lưu/mở file `.nxf`.
3. **View 2D/3D**: render lưới, tầng, phần tử; camera, chọn, bắt điểm; công cụ vẽ Beam/Column/Slab.
4. **Assign**: gối, tải, tiết diện lên đối tượng chọn; hiển thị biểu tượng trên view.
5. **Solver v1**: khung 3D tuyến tính tĩnh, so với bài toán mẫu trong `tests/benchmarks`.
6. **Kết quả**: biểu đồ nội lực, biến dạng, bảng kết quả.
7. **Mở rộng**: shell + chia lưới, modal, phổ phản ứng, thiết kế theo TCVN.

Đã chốt (06/11/2026): giữ Tauri + React + Rust, chạy trên Windows, repo `thai-coder/NexFEM`. Xem `docs/ROADMAP.md` và `docs/adr/`.

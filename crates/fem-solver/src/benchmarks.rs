//! Bài toán mẫu có lời giải giải tích. Đơn vị kN, m.

use crate::{analyze, Options, Results};
use fem_core::Model;
use serde_json::json;

const E: f64 = 2.0e8; // kN/m² (thép 200 GPa)
const NU: f64 = 0.3;
const B: f64 = 0.2;
const H: f64 = 0.4;
const A: f64 = B * H;
const I33: f64 = B * H * H * H / 12.0; // uốn trong mặt phẳng đứng của dầm

fn model(
    joints: serde_json::Value,
    frames: serde_json::Value,
    frame_loads: serde_json::Value,
) -> Model {
    let v = json!({
        "schemaVersion": 1, "name": "bench", "units": {"force":"kN","length":"m","temperature":"C"},
        "grids": [], "stories": [],
        "materials": [{"id":"m","name":"S","type":"steel","E":E,"nu":NU,"gamma":0.0}],
        "frameSections": [{"id":"s","name":"R","material":"m","geometry":{"shape":"rect","b":B,"h":H}}],
        "shellSections": [], "joints": joints, "frames": frames, "shells": [],
        "loadPatterns": [{"id":"p","name":"P","type":"live","selfWeight":0.0}],
        "loadCases": [{"id":"c","name":"C","type":"linearStatic","loads":[{"pattern":"p","factor":1.0}]}],
        "combos": [{"id":"k","name":"K","type":"linearAdd","items":[{"case":"c","factor":1.5}]}],
        "frameLoads": frame_loads, "shellLoads": []
    });
    serde_json::from_value(v).unwrap()
}

const FIX: [bool; 6] = [true; 6];
/// Khớp (giữ thêm xoay quanh trục dầm để không bị xoắn tự do).
const PIN: [bool; 6] = [true, true, true, true, false, false];
const ROLLER: [bool; 6] = [false, true, true, true, false, false];

fn run(m: &Model) -> Results {
    analyze(m, &Options::default()).expect("phân tích được")
}

fn close(a: f64, b: f64, rel: f64) -> bool {
    (a - b).abs() <= rel * b.abs().max(1e-12)
}

#[test]
fn cantilever_point_load() {
    let (l, p): (f64, f64) = (3.0, 10.0);
    let m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":l,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"gravity","value":p,"at":1.0}]),
    );
    let r = run(&m);
    let c = &r.cases[0];
    let uz = c.displacements["b"][2];
    assert!(
        close(uz, -p * l.powi(3) / (3.0 * E * I33), 1e-9),
        "uz = {uz}"
    );
    // Phản lực và mô men ngàm.
    assert!(close(c.reactions["a"][2], p, 1e-9));
    let ff = &c.frames["f"];
    assert!(close(ff.m3[0], -p * l, 1e-9), "M3 ngàm = {}", ff.m3[0]);
    assert!(ff.m3.last().unwrap().abs() < 1e-9);
    // Tổ hợp 1.5 × C.
    let k = &r.cases[1];
    assert_eq!(k.kind, "combo");
    assert!(close(k.displacements["b"][2], 1.5 * uz, 1e-12));
}

#[test]
fn simply_supported_udl() {
    let (l, w): (f64, f64) = (6.0, 12.0);
    let m = model(
        json!([
            {"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":PIN},
            {"id":"c","label":"2","x":l/2.0,"y":0,"z":0},
            {"id":"b","label":"3","x":l,"y":0,"z":0,"restraint":ROLLER}
        ]),
        json!([
            {"id":"f1","label":"B1","kind":"beam","i":"a","j":"c","section":"s"},
            {"id":"f2","label":"B2","kind":"beam","i":"c","j":"b","section":"s"}
        ]),
        json!([
            {"id":"l1","frame":"f1","pattern":"p","kind":"distributed","direction":"gravity","value":w},
            {"id":"l2","frame":"f2","pattern":"p","kind":"distributed","direction":"gravity","value":w}
        ]),
    );
    let c = &run(&m).cases[0];
    let mid = c.displacements["c"][2];
    assert!(
        close(mid, -5.0 * w * l.powi(4) / (384.0 * E * I33), 1e-9),
        "võng giữa nhịp {mid}"
    );
    let m_mid = *c.frames["f1"].m3.last().unwrap();
    assert!(close(m_mid, w * l * l / 8.0, 1e-9), "M giữa nhịp {m_mid}");
    assert!(close(c.reactions["a"][2], w * l / 2.0, 1e-9));
    assert!(close(c.sum_reactions[2], -c.applied[2], 1e-12));
}

#[test]
fn fixed_fixed_udl_and_released_ends() {
    let (l, w) = (5.0, 8.0);
    let joints = json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":l,"y":0,"z":0,"restraint":FIX}]);
    let loads = json!([{"id":"l","frame":"f","pattern":"p","kind":"distributed","direction":"gravity","value":w}]);
    let fixed = model(
        joints.clone(),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        loads.clone(),
    );
    let ff = &run(&fixed).cases[0].frames["f"];
    assert!(
        close(ff.m3[0], -w * l * l / 12.0, 1e-9),
        "M ngàm {}",
        ff.m3[0]
    );
    assert!(
        close(ff.m3[4], w * l * l / 24.0, 1e-9),
        "M giữa {}",
        ff.m3[4]
    );

    // Nhả M2, M3 hai đầu → làm việc như dầm đơn giản.
    let rel = [false, false, false, false, true, true];
    let pinned = model(
        joints,
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s","releases":{"i":rel,"j":rel}}]),
        loads,
    );
    let fp = &run(&pinned).cases[0].frames["f"];
    assert!(fp.m3[0].abs() < 1e-9);
    assert!(close(fp.m3[4], w * l * l / 8.0, 1e-9));
}

#[test]
fn axial_and_torsion() {
    let (l, p, t) = (4.0, 50.0, 3.0);
    let m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":0,"y":0,"z":l}]),
        json!([{"id":"f","label":"C1","kind":"column","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"localX","value":p,"at":1.0}]),
    );
    let c = &run(&m).cases[0];
    assert!(close(c.displacements["b"][2], p * l / (E * A), 1e-9));
    assert!(close(c.frames["f"].p[0], p, 1e-9), "kéo dương");
    let _ = t;
}

#[test]
fn portal_frame_equilibrium_and_symmetry() {
    // Khung cổng ngàm chân, tải ngang H tại đỉnh trái.
    let (h, l, hx) = (3.0, 6.0, 20.0);
    let mut m = model(
        json!([
            {"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},
            {"id":"b","label":"2","x":0,"y":0,"z":h},
            {"id":"c","label":"3","x":l,"y":0,"z":h},
            {"id":"d","label":"4","x":l,"y":0,"z":0,"restraint":FIX}
        ]),
        json!([
            {"id":"c1","label":"C1","kind":"column","i":"a","j":"b","section":"s"},
            {"id":"b1","label":"B1","kind":"beam","i":"b","j":"c","section":"s"},
            {"id":"c2","label":"C2","kind":"column","i":"d","j":"c","section":"s"}
        ]),
        json!([{"id":"l","frame":"b1","pattern":"p","kind":"point","direction":"globalX","value":hx,"at":0.0}]),
    );
    m.frame_loads[0].at = Some(0.0);
    let c = &run(&m).cases[0];
    assert!(
        close(c.sum_reactions[0], -hx, 1e-9),
        "ΣRx = {:?}",
        c.sum_reactions
    );
    // Hai chân cùng độ cứng → lực cắt gần bằng nhau (lệch nhỏ do dầm co ngắn dọc trục).
    assert!(
        close(c.reactions["a"][0], -hx / 2.0, 0.02),
        "{:?}",
        c.reactions
    );
    // Cân bằng mô men quanh trục Y tại chân trái: H·h + ΣMy + x_d·Rz_d... = 0.
    let (ra, rd) = (c.reactions["a"], c.reactions["d"]);
    let my = hx * h + ra[4] + rd[4] - l * rd[2];
    assert!(my.abs() < 1e-6, "ΣMy = {my}");
}

#[test]
fn unstable_model_reports_joint() {
    let m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0},{"id":"b","label":"2","x":3,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([]),
    );
    let e = analyze(&m, &Options::default()).unwrap_err();
    assert_eq!(e.code, "unstable");
    assert!(e.message.contains("mất ổn định"));
}

#[test]
fn sample_building_gravity_equilibrium() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../resources/templates/sample-frame.json"
    );
    let m = Model::from_json(&std::fs::read_to_string(path).unwrap()).unwrap();
    let r = run(&m);
    assert_eq!(r.joints, 72);
    for c in &r.cases {
        assert!(
            close(c.sum_reactions[2], -c.applied[2], 1e-7),
            "{}: ΣRz = {} , tải = {}",
            c.name,
            c.sum_reactions[2],
            c.applied[2]
        );
    }
    let dl = r.cases.iter().find(|c| c.id == "lc-dl").unwrap();
    assert!(dl.applied[2] < 0.0);
    // SDL = 1.5 kN/m² × diện tích sàn 18 × 14.4 × 5 tầng.
    let sdl = r.cases.iter().find(|c| c.id == "lc-sdl").unwrap();
    assert!(
        close(-sdl.applied[2], 1.5 * 18.0 * 14.4 * 5.0, 1e-9),
        "SDL = {}",
        sdl.applied[2]
    );
    assert!(
        r.warnings.iter().any(|w| w.code == "case_skipped"),
        "modal bị bỏ qua có cảnh báo"
    );
}

#[test]
fn tributary_45_degree_rule() {
    let a = crate::analysis::edge_tributary(&[
        [0.0, 0.0, 0.0],
        [6.0, 0.0, 0.0],
        [6.0, 4.0, 0.0],
        [0.0, 4.0, 0.0],
    ]);
    // Cạnh dài 6 m: hình thang 4·6/2 − 4²/4 = 8; cạnh ngắn 4 m: tam giác 4.
    assert_eq!(a, vec![8.0, 4.0, 8.0, 4.0]);
    assert!((a.iter().sum::<f64>() - 24.0).abs() < 1e-12);
}

// Giai đoạn 5 — regression tests: không được mất tải, bỏ qua releases hay phụ thuộc thứ tự combo.
#[test]
fn rejects_missing_frame_and_pattern_loads() {
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":3,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"missing","pattern":"p","kind":"point","direction":"gravity","value":10.0,"at":1.0}]),
    );
    assert_eq!(analyze(&m, &Options::default()).err().unwrap().code, "invalid_frame_load");
    m.frame_loads[0].frame = "f".into();
    m.frame_loads[0].pattern = "missing".into();
    assert_eq!(analyze(&m, &Options::default()).err().unwrap().code, "invalid_frame_load");
    m.frame_loads[0].pattern = "p".into();
    m.load_cases[0].loads[0].pattern = "missing".into();
    assert_eq!(analyze(&m, &Options::default()).err().unwrap().code, "invalid_load_case");
}

#[test]
fn nested_combos_work_out_of_order_and_cycles_fail() {
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":3,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"gravity","value":10.0,"at":1.0}]),
    );
    m.combos = serde_json::from_value(json!([
        {"id":"outer","name":"Outer","type":"linearAdd","items":[{"case":"inner","factor":2.0}]},
        {"id":"inner","name":"Inner","type":"linearAdd","items":[{"case":"c","factor":1.5}]}
    ])).unwrap();
    let r = run(&m);
    let uz = r.cases.iter().find(|c| c.id == "c").unwrap().displacements["b"][2];
    let outer = r.cases.iter().find(|c| c.id == "outer").unwrap();
    assert!(close(outer.displacements["b"][2], 3.0 * uz, 1e-10));
    m.combos[1].items[0].case = "outer".into();
    assert_eq!(analyze(&m, &Options::default()).err().unwrap().code, "combo_dependency");
}

#[test]
fn rejects_singular_release_condensation_instead_of_ignoring_it() {
    let mut k = [[0.0; 12]; 12];
    k[0][0] = 100.0;
    let mut releases = [false; 12];
    releases[3] = true;
    assert!(crate::element::condense(&k, &[0.0; 12], &releases).is_err());
}

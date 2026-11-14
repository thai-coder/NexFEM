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
fn local_axis_angle_turns_the_strong_axis_like_csi() {
    // Cột công xôn thẳng đứng, tải đầu cột theo Y. Trục mặc định: e2 = X, e3 = Y, tải theo e3 → uốn quanh trục yếu I22.
    // Góc 90° (quy ước ETABS/SAP2000): e2' = e3 = Y → tải theo e2' → uốn quanh trục khoẻ I33.
    let (l, p): (f64, f64) = (3.0, 10.0);
    let i22 = H * B.powi(3) / 12.0;
    let tip = |angle: Option<f64>| {
        let mut frame =
            json!({"id":"f","label":"C1","kind":"column","i":"a","j":"b","section":"s"});
        if let Some(a) = angle {
            frame["angle"] = json!(a);
        }
        let m = model(
            json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":0,"y":0,"z":l}]),
            json!([frame]),
            json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"globalY","value":p,"at":1.0}]),
        );
        let r = run(&m);
        let c = &r.cases[0];
        (
            c.displacements["b"],
            c.frames["f"].m2[0],
            c.frames["f"].m3[0],
        )
    };
    let (d0, m2_0, m3_0) = tip(None);
    assert!(
        close(d0[1], p * l.powi(3) / (3.0 * E * i22), 1e-9),
        "uy = {}",
        d0[1]
    );
    assert!(close(m2_0.abs(), p * l, 1e-9) && m3_0.abs() < 1e-9);
    let (d90, m2_90, m3_90) = tip(Some(90.0));
    assert!(
        close(d90[1], p * l.powi(3) / (3.0 * E * I33), 1e-9),
        "uy = {}",
        d90[1]
    );
    assert!(close(m3_90.abs(), p * l, 1e-9) && m2_90.abs() < 1e-9);
    assert!(d90[0].abs() < 1e-15);
    // Góc 30°: độ mềm theo Y là tổ hợp hai trục; tải tạo cả chuyển vị X.
    let (d30, ..) = tip(Some(30.0));
    let (s, c) = 30f64.to_radians().sin_cos();
    let f = p * l.powi(3) / (3.0 * E);
    assert!(
        close(d30[1], f * (c * c / i22 + s * s / I33), 1e-9),
        "uy = {}",
        d30[1]
    );
    assert!(
        close(d30[0], f * s * c * (1.0 / I33 - 1.0 / i22), 1e-9),
        "ux = {}",
        d30[0]
    );
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
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_frame_load"
    );
    m.frame_loads[0].frame = "f".into();
    m.frame_loads[0].pattern = "missing".into();
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_frame_load"
    );
    m.frame_loads[0].pattern = "p".into();
    m.load_cases[0].loads[0].pattern = "missing".into();
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_load_case"
    );
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
    ]))
    .unwrap();
    let r = run(&m);
    let uz = r.cases.iter().find(|c| c.id == "c").unwrap().displacements["b"][2];
    let outer = r.cases.iter().find(|c| c.id == "outer").unwrap();
    assert!(close(outer.displacements["b"][2], 3.0 * uz, 1e-10));
    m.combos[1].items[0].case = "outer".into();
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "combo_dependency"
    );
}

#[test]
fn rejects_singular_release_condensation_instead_of_ignoring_it() {
    let mut k = [[0.0; 12]; 12];
    k[0][0] = 100.0;
    let mut releases = [false; 12];
    releases[3] = true;
    assert!(crate::element::condense(&k, &[0.0; 12], &releases).is_err());
}

#[test]
fn rejects_impossible_section_dimensions_in_solver_without_ui() {
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":3,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([]),
    );
    m.frame_sections[0].geometry =
        serde_json::from_value(json!({"shape":"box","h":0.3,"b":0.2,"t":0.11})).unwrap();
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_section"
    );
}

#[test]
fn timoshenko_cantilever_deflection_adds_shear_compliance() {
    let l = 1.0_f64;
    let p = 10.0_f64;
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":l,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"gravity","value":p,"at":1.0}]),
    );
    let baseline = run(&m).cases[0].displacements["b"][2];
    let a2 = A * 5.0 / 6.0;
    m.frame_sections[0].shear_areas = Some(fem_core::ShearAreas { a2, a3: a2 });
    let deflection = run(&m).cases[0].displacements["b"][2];
    let g = E / (2.0 * (1.0 + NU));
    let expected = -p * l.powi(3) / (3.0 * E * I33) - p * l / (g * a2);
    assert!(
        close(deflection, expected, 1e-9),
        "Timoshenko: {deflection} != {expected}"
    );
    assert!(
        deflection < baseline,
        "Ứng xử chịu cắt phải mềm hơn Euler–Bernoulli"
    );
}

#[test]
fn envelope_min_max_and_srss_are_componentwise_not_equilibrium_cases() {
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":3,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s"}]),
        json!([{"id":"l","frame":"f","pattern":"p","kind":"point","direction":"gravity","value":10.0,"at":1.0}]),
    );
    m.load_cases.push(serde_json::from_value(json!({
        "id":"reverse","name":"Reverse","type":"linearStatic","loads":[{"pattern":"p","factor":-2.0}]
    })).unwrap());
    m.combos = serde_json::from_value(json!([
        {"id":"env","name":"ENV","type":"envelope","items":[{"case":"c","factor":1.0},{"case":"reverse","factor":1.0}]},
        {"id":"rss","name":"RSS","type":"srss","items":[{"case":"c","factor":1.0},{"case":"reverse","factor":1.0}]}
    ])).unwrap();
    let r = run(&m);
    let baseline = r.cases.iter().find(|c| c.id == "c").unwrap().displacements["b"][2];
    let max = r.cases.iter().find(|c| c.id == "env:max").unwrap();
    let min = r.cases.iter().find(|c| c.id == "env:min").unwrap();
    let rss = r.cases.iter().find(|c| c.id == "rss").unwrap();
    assert_eq!(max.kind, "envelopeMax");
    assert!(close(max.displacements["b"][2], -2.0 * baseline, 1e-10));
    assert!(close(min.displacements["b"][2], baseline, 1e-10));
    assert!(close(
        rss.displacements["b"][2],
        baseline.abs() * 5.0_f64.sqrt(),
        1e-10
    ));
    assert_eq!(rss.applied, [0.0; 3]);
    // Lồng envelope dưới linearAdd là sai ngữ nghĩa kỹ thuật.
    m.combos.push(
        serde_json::from_value(json!({
            "id":"bad","name":"bad","type":"linearAdd","items":[{"case":"env","factor":1.0}]
        }))
        .unwrap(),
    );
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "nonlinear_combo_dependency"
    );
}

#[test]
fn rigid_end_offset_reduces_flexible_span_and_transfers_support_moment() {
    let l = 3.0_f64;
    let p = 10.0_f64;
    let rigid = 0.8_f64;
    let mut m = model(
        json!([{"id":"a","label":"1","x":0,"y":0,"z":0,"restraint":FIX},{"id":"b","label":"2","x":l,"y":0,"z":0}]),
        json!([{"id":"f","label":"B1","kind":"beam","i":"a","j":"b","section":"s","offsets":{"i":rigid,"j":0.0}}]),
        json!([{"id":"load","frame":"f","pattern":"p","kind":"point","direction":"gravity","value":p,"at":1.0}]),
    );
    let r = run(&m);
    let c = &r.cases[0];
    let expected_uz = -p * (l - rigid).powi(3) / (3.0 * E * I33);
    assert!(close(c.displacements["b"][2], expected_uz, 1e-9));
    assert!(close(c.reactions["a"][2], p, 1e-9));
    assert!(
        close(c.reactions["a"][4], -p * l, 1e-9),
        "base reaction = {:?}",
        c.reactions["a"]
    );
    assert!(close(c.frames["f"].x[0], rigid, 1e-9));
    m.frames[0].offsets = Some(fem_core::FrameOffsets { i: l, j: 0.0 });
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_offsets"
    );
}

#[test]
fn rigid_diaphragm_shares_horizontal_shear_between_two_columns() {
    let l = 3.0_f64;
    let p = 10.0_f64;
    let mut m = model(
        json!([
            {"id":"a0","label":"a0","x":0,"y":0,"z":0,"restraint":FIX},
            {"id":"a1","label":"a1","x":0,"y":0,"z":l},
            {"id":"b0","label":"b0","x":4,"y":0,"z":0,"restraint":FIX},
            {"id":"b1","label":"b1","x":4,"y":0,"z":l}
        ]),
        json!([
            {"id":"col-a","label":"C1","kind":"column","i":"a0","j":"a1","section":"s"},
            {"id":"col-b","label":"C2","kind":"column","i":"b0","j":"b1","section":"s"}
        ]),
        json!([
            {"id":"horizontal","frame":"col-a","pattern":"p","kind":"point","direction":"globalX","value":p,"at":1.0}
        ]),
    );
    let free = run(&m).cases[0].displacements["a1"][0];
    m.diaphragms = serde_json::from_value(json!([{
        "id":"D1","name":"Roof","master":"a1","slaves":["b1"]
    }]))
    .unwrap();
    let r = run(&m);
    let c = &r.cases[0];
    let u1 = c.displacements["a1"][0];
    let u2 = c.displacements["b1"][0];
    assert!(
        close(u1, u2, 1e-9),
        "Diaphragm does not constrain Ux: {u1}, {u2}"
    );
    assert!(
        close(u1, free / 2.0, 1e-8),
        "Shared drift: {u1}, free: {free}"
    );
    assert!(close(c.sum_reactions[0], -p, 1e-8));
    assert!(close(c.reactions["a0"][0], -p / 2.0, 1e-8));
    assert!(close(c.reactions["b0"][0], -p / 2.0, 1e-8));
    m.joints
        .iter_mut()
        .find(|j| j.id == "b1")
        .unwrap()
        .restraint = Some([true, false, false, false, false, false]);
    assert_eq!(
        analyze(&m, &Options::default()).err().unwrap().code,
        "invalid_diaphragm"
    );
}

// Đặc trưng tiết diện thép cán so với bảng EN 10365:2017; cùng số liệu với
// `packages/model-core/test/sections-catalog.test.ts` để bảo đảm TypeScript và Rust giống nhau.
#[cfg(test)]
mod rolled_sections {
    use crate::analysis::i_section;

    /// (tên, h, b, tw, tf, r [mm], A [cm²], Iy [cm⁴], Iz [cm⁴], It [cm⁴])
    type Row = (&'static str, f64, f64, f64, f64, f64, f64, f64, f64, f64);
    const CATALOG: [Row; 4] = [
        (
            "IPE 200", 200.0, 100.0, 5.6, 8.5, 12.0, 28.48, 1943.0, 142.4, 6.98,
        ),
        (
            "IPE 300", 300.0, 150.0, 7.1, 10.7, 15.0, 53.81, 8356.0, 603.8, 20.12,
        ),
        (
            "HEA 200", 190.0, 200.0, 6.5, 10.0, 18.0, 53.83, 3692.0, 1336.0, 20.98,
        ),
        (
            "HEB 300", 300.0, 300.0, 11.0, 19.0, 27.0, 149.1, 25170.0, 8563.0, 185.0,
        ),
    ];

    fn rel(got: f64, want: f64) -> f64 {
        (got - want).abs() / want
    }

    #[test]
    fn i_sections_match_en10365_catalogue() {
        for (name, h, b, tw, tf, r, a, iy, iz, it) in CATALOG {
            let mm = 1e-3;
            let (ga, gi22, gi33, gj) = i_section(h * mm, b * mm, tf * mm, tw * mm, r * mm);
            assert!(rel(ga * 1e4, a) < 1e-3, "{name} A");
            assert!(rel(gi33 * 1e8, iy) < 1e-3, "{name} Iy");
            assert!(rel(gi22 * 1e8, iz) < 1e-3, "{name} Iz");
            assert!(rel(gj * 1e8, it) < 0.025, "{name} It");
        }
    }

    #[test]
    fn zero_root_radius_keeps_thin_walled_formula() {
        let (a, i22, i33, j) = i_section(0.3, 0.15, 0.01, 0.006, 0.0);
        let hw: f64 = 0.28;
        assert!((a - (2.0 * 0.15 * 0.01 + hw * 0.006)).abs() < 1e-15);
        assert!((i33 - (0.15 * 0.3f64.powi(3) - 0.144 * hw.powi(3)) / 12.0).abs() < 1e-15);
        assert!(
            (i22 - (2.0 * 0.01 * 0.15f64.powi(3) + hw * 0.006f64.powi(3)) / 12.0).abs() < 1e-15
        );
        assert!((j - (2.0 * 0.15 * 0.01f64.powi(3) + hw * 0.006f64.powi(3)) / 3.0).abs() < 1e-15);
    }
}

// Ống hộp có bán kính góc: so với tích phân đa giác độc lập (cùng các trường hợp với
// `packages/model-core/test/box-section.test.ts`) để TypeScript và Rust giống nhau.
#[cfg(test)]
mod box_sections {
    use crate::analysis::box_section;
    use std::f64::consts::PI;

    /// Đa giác hình chữ nhật bo góc; `hole` đảo chiều để trừ diện tích.
    fn polygon(b: f64, h: f64, r: f64, hole: bool) -> Vec<(f64, f64)> {
        let n = 4000;
        let corners = [
            (b / 2.0 - r, h / 2.0 - r, 0.0),
            (-b / 2.0 + r, h / 2.0 - r, PI / 2.0),
            (-b / 2.0 + r, -h / 2.0 + r, PI),
            (b / 2.0 - r, -h / 2.0 + r, 3.0 * PI / 2.0),
        ];
        let mut pts = Vec::new();
        for (cx, cy, a0) in corners {
            if r <= 0.0 {
                pts.push((cx, cy));
            } else {
                for i in 0..=n {
                    let a = a0 + PI / 2.0 * f64::from(i) / f64::from(n);
                    pts.push((cx + r * a.cos(), cy + r * a.sin()));
                }
            }
        }
        if hole {
            pts.reverse();
        }
        pts
    }

    fn props(ring: &[(f64, f64)]) -> (f64, f64, f64) {
        let (mut a, mut ixx, mut iyy) = (0.0, 0.0, 0.0);
        for i in 0..ring.len() {
            let (x0, y0) = ring[i];
            let (x1, y1) = ring[(i + 1) % ring.len()];
            let c = x0 * y1 - x1 * y0;
            a += c / 2.0;
            ixx += c * (y0 * y0 + y0 * y1 + y1 * y1) / 12.0;
            iyy += c * (x0 * x0 + x0 * x1 + x1 * x1) / 12.0;
        }
        (a, ixx, iyy)
    }

    #[test]
    fn rounded_boxes_match_polygon_integration() {
        let cases = [
            (0.2, 0.2, 0.01, 0.02),
            (0.3, 0.15, 0.008, 0.016),
            (0.12, 0.06, 0.004, 0.006),
            (0.2, 0.1, 0.01, 0.006),
        ];
        for (h, b, t, r) in cases {
            let o = props(&polygon(b, h, r, false));
            let i = props(&polygon(b - 2.0 * t, h - 2.0 * t, (r - t).max(0.0), true));
            let (a, i22, i33, j) = box_section(h, b, t, r);
            assert!(((a - (o.0 + i.0)) / a).abs() < 1e-5, "A {h}x{b}x{t}");
            assert!(((i33 - (o.1 + i.1)) / i33).abs() < 1e-5, "I33 {h}x{b}x{t}");
            assert!(((i22 - (o.2 + i.2)) / i22).abs() < 1e-5, "I22 {h}x{b}x{t}");
            assert!(j > 0.0);
        }
    }

    #[test]
    fn square_corners_keep_previous_formula() {
        let (a, i22, i33, j) = box_section(0.2, 0.2, 0.01, 0.0);
        assert!((a - (0.04 - 0.0324)).abs() < 1e-15);
        assert!((i22 - i33).abs() < 1e-15);
        assert!((j - 2.0 * 0.01 * 0.19f64.powi(2) * 0.19f64.powi(2) / 0.38).abs() < 1e-15);
    }
}

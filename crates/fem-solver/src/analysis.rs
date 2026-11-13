//! Phân tích tĩnh tuyến tính khung 3D.
//!
//! Giả thiết (Giai đoạn 5):
//! - Thanh: phần tử dầm 3D Euler–Bernoulli, có nhả liên kết; chưa có offset/vùng cứng, chưa có biến dạng cắt.
//! - Sàn: chưa có độ cứng; tải sàn (và trọng lượng bản thân sàn) truyền về các thanh biên theo
//!   quy tắc 45° (ô chữ nhật) hoặc chia tam giác từ trọng tâm (ô khác), dưới dạng tải phân bố đều tương đương.
//! - Vách: chưa có độ cứng; tải trên vách chia đều về các nút của vách.
//! - Chỉ có trường hợp tải tĩnh tuyến tính và tổ hợp cộng tuyến tính.

use crate::element::*;
use crate::matrix::{Matrix, SolveError};
use crate::skyline::reverse_cuthill_mckee;
use fem_core::{FrameShape, Model};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};

const DOF_NAMES: [&str; 6] = ["Ux", "Uy", "Uz", "Rx", "Ry", "Rz"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Warning {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub objects: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub objects: Vec<String>,
}

impl AnalysisError {
    fn new(code: &str, message: impl Into<String>, objects: Vec<String>) -> Self {
        AnalysisError {
            code: code.into(),
            message: message.into(),
            objects,
        }
    }
}

/// Nội lực tại các điểm dọc thanh (theo trục cục bộ). x tính từ đầu i (m).
/// Quy ước: lực trên mặt cắt dương; P > 0 là kéo; M3 > 0 làm căng thớ dưới (dầm võng xuống).
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameForces {
    pub x: Vec<f64>,
    pub p: Vec<f64>,
    pub v2: Vec<f64>,
    pub v3: Vec<f64>,
    pub t: Vec<f64>,
    pub m2: Vec<f64>,
    pub m3: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseResult {
    pub id: String,
    pub name: String,
    /// "case" hoặc "combo".
    pub kind: String,
    /// Chuyển vị nút [Ux, Uy, Uz, Rx, Ry, Rz] (m, rad).
    pub displacements: BTreeMap<String, [f64; 6]>,
    /// Phản lực tại nút có gối [Fx, Fy, Fz, Mx, My, Mz] (kN, kN·m).
    pub reactions: BTreeMap<String, [f64; 6]>,
    pub frames: BTreeMap<String, FrameForces>,
    /// Tổng lực tác dụng [Fx, Fy, Fz] và tổng phản lực, để kiểm tra cân bằng.
    pub applied: [f64; 3],
    pub sum_reactions: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Results {
    pub dof: usize,
    pub joints: usize,
    pub frames: usize,
    pub profile: usize,
    pub cases: Vec<CaseResult>,
    pub warnings: Vec<Warning>,
}

pub struct Options {
    /// Số điểm tính nội lực trên mỗi thanh (≥ 2).
    pub stations: usize,
}

impl Default for Options {
    fn default() -> Self {
        Options { stations: 9 }
    }
}

/// Đặc trưng tiết diện (m), giống `packages/model-core/src/sections.ts`.
pub fn section_props(g: &FrameShape) -> (f64, f64, f64, f64) {
    use std::f64::consts::PI;
    match *g {
        FrameShape::Rect { b, h } => {
            let (a, c) = (b.max(h), b.min(h));
            let j = a
                * c.powi(3)
                * (1.0 / 3.0 - 0.21 * (c / a) * (1.0 - c.powi(4) / (12.0 * a.powi(4))));
            (b * h, h * b.powi(3) / 12.0, b * h.powi(3) / 12.0, j)
        }
        FrameShape::Circle { d } => {
            let r = d / 2.0;
            let i = PI * r.powi(4) / 4.0;
            (PI * r * r, i, i, 2.0 * i)
        }
        FrameShape::I { h, bf, tf, tw } => {
            let hw = h - 2.0 * tf;
            let a = 2.0 * bf * tf + hw * tw;
            let i33 = (bf * h.powi(3) - (bf - tw) * hw.powi(3)) / 12.0;
            let i22 = (2.0 * tf * bf.powi(3) + hw * tw.powi(3)) / 12.0;
            let j = (2.0 * bf * tf.powi(3) + hw * tw.powi(3)) / 3.0;
            (a, i22, i33, j)
        }
        FrameShape::Box { h, b, t } => {
            let (hi, bi) = (h - 2.0 * t, b - 2.0 * t);
            let a = b * h - bi * hi;
            let i33 = (b * h.powi(3) - bi * hi.powi(3)) / 12.0;
            let i22 = (h * b.powi(3) - hi * bi.powi(3)) / 12.0;
            let j = 2.0 * t * (b - t).powi(2) * (h - t).powi(2) / (b + h - 2.0 * t);
            (a, i22, i33, j)
        }
        FrameShape::Pipe { d, t } => {
            let (ro, ri) = (d / 2.0, d / 2.0 - t);
            let i = PI * (ro.powi(4) - ri.powi(4)) / 4.0;
            (PI * (ro * ro - ri * ri), i, i, 2.0 * i)
        }
    }
}

enum MemberLoad {
    /// Tải phân bố đều (cục bộ, kN/m) trên cả chiều dài.
    Uniform(V3),
    /// Lực tập trung (cục bộ, kN) tại khoảng cách a từ đầu i.
    Point(V3, f64),
}

struct Elem {
    id: String,
    ax: [V3; 3],
    l: f64,
    k_local: M12,
    released: [bool; 12],
    k_cond: M12,
    /// Offset hình học của đầu mềm so với tim nút, theo hệ tổng thể.
    offset_i: V3,
    offset_j: V3,
    offset_i_length: f64,
    /// Bậc tự do tổng thể của 12 thành phần (None = bị gối giữ).
    dofs: [Vec<(usize, f64)>; 12],
    ji: usize,
    jj: usize,
}

/// Tải của một mẫu tải: tải nút (theo chỉ số nút trong tập nút phân tích) và tải trên thanh.
#[derive(Default)]
struct PatternLoads {
    joint: HashMap<usize, [f64; 6]>,
    member: HashMap<usize, Vec<MemberLoad>>,
}

pub fn analyze(model: &Model, opts: &Options) -> Result<Results, AnalysisError> {
    let mut warnings: Vec<Warning> = Vec::new();
    let warn = |w: &mut Vec<Warning>, code: &str, msg: String, objects: Vec<String>| {
        w.push(Warning {
            code: code.into(),
            message: msg,
            objects,
        })
    };
    if model.frames.is_empty() {
        return Err(AnalysisError::new(
            "no_frames",
            "Mô hình chưa có thanh nào để phân tích",
            vec![],
        ));
    }

    // Dữ liệu có thể được gọi thẳng từ API/WASM; không được tin rằng UI đã Check model.
    // Tránh trường hợp tải biến mất im lặng nhưng vẫn trả "ok: true".
    let pattern_ids: HashSet<&str> = model.load_patterns.iter().map(|x| x.id.as_str()).collect();
    let frame_ids: HashSet<&str> = model.frames.iter().map(|x| x.id.as_str()).collect();
    let shell_ids: HashSet<&str> = model.shells.iter().map(|x| x.id.as_str()).collect();
    let case_ids: HashSet<&str> = model.load_cases.iter().map(|x| x.id.as_str()).collect();
    let combo_ids: HashSet<&str> = model.combos.iter().map(|x| x.id.as_str()).collect();
    for load in &model.frame_loads {
        if !frame_ids.contains(load.frame.as_str()) || !pattern_ids.contains(load.pattern.as_str())
        {
            return Err(AnalysisError::new(
                "invalid_frame_load",
                format!(
                    "Tải thanh {} tham chiếu tới thanh hoặc mẫu tải không tồn tại",
                    load.id
                ),
                vec![load.id.clone()],
            ));
        }
        if load.kind == "point" && !load.at.is_some_and(|a| (0.0..=1.0).contains(&a)) {
            return Err(AnalysisError::new(
                "invalid_frame_load",
                format!("Tải tập trung {} có vị trí không hợp lệ", load.id),
                vec![load.id.clone()],
            ));
        }
    }
    for load in &model.shell_loads {
        if !shell_ids.contains(load.shell.as_str()) || !pattern_ids.contains(load.pattern.as_str())
        {
            return Err(AnalysisError::new(
                "invalid_shell_load",
                format!(
                    "Tải sàn/vách {} tham chiếu tới đối tượng hoặc mẫu tải không tồn tại",
                    load.id
                ),
                vec![load.id.clone()],
            ));
        }
    }
    for case in &model.load_cases {
        if case
            .loads
            .iter()
            .any(|x| !pattern_ids.contains(x.pattern.as_str()))
        {
            return Err(AnalysisError::new(
                "invalid_load_case",
                format!("Trường hợp {} chứa mẫu tải không tồn tại", case.name),
                vec![case.id.clone()],
            ));
        }
    }
    for co in &model.combos {
        if co
            .items
            .iter()
            .any(|x| !case_ids.contains(x.case.as_str()) && !combo_ids.contains(x.case.as_str()))
        {
            return Err(AnalysisError::new(
                "invalid_combo",
                format!(
                    "Tổ hợp {} tham chiếu trường hợp/tổ hợp không tồn tại",
                    co.name
                ),
                vec![co.id.clone()],
            ));
        }
    }

    // ---- nút tham gia phân tích: nút của các thanh
    let joint_by_id: HashMap<&str, usize> = model
        .joints
        .iter()
        .enumerate()
        .map(|(i, j)| (j.id.as_str(), i))
        .collect();
    let mut used = vec![false; model.joints.len()];
    for f in &model.frames {
        for id in [&f.i, &f.j] {
            let k = *joint_by_id.get(id.as_str()).ok_or_else(|| {
                AnalysisError::new(
                    "missing_joint",
                    format!("Thanh {} tham chiếu nút không tồn tại", f.label),
                    vec![f.id.clone()],
                )
            })?;
            used[k] = true;
        }
    }
    let nodes: Vec<usize> = (0..model.joints.len()).filter(|&k| used[k]).collect();
    let node_of: HashMap<usize, usize> = nodes.iter().enumerate().map(|(n, &k)| (k, n)).collect();
    // Master/slave thuộc cùng diaphragm; dùng MPC chính xác theo mặt phẳng XY:
    // Ux_s = Ux_m - (y_s-y_m)*Rz_m; Uy_s = Uy_m + (x_s-x_m)*Rz_m; Rz_s=Rz_m.
    let mut bindings: Vec<(usize, usize, f64, f64)> = Vec::new();
    let mut occupied: HashSet<usize> = HashSet::new();
    let mut slave_nodes: HashSet<usize> = HashSet::new();
    for group in &model.diaphragms {
        let mut members: Vec<usize> = Vec::new();
        for id in std::iter::once(&group.master).chain(&group.slaves) {
            let index = joint_by_id
                .get(id.as_str())
                .and_then(|&i| node_of.get(&i))
                .copied()
                .ok_or_else(|| {
                    AnalysisError::new(
                        "invalid_diaphragm",
                        format!(
                            "Diaphragm {} chứa nút không thuộc phần tử thanh",
                            group.name
                        ),
                        vec![group.id.clone()],
                    )
                })?;
            if !occupied.insert(index) {
                return Err(AnalysisError::new(
                    "invalid_diaphragm",
                    format!("Diaphragm {} có nút lặp hoặc trùng nhóm khác", group.name),
                    vec![group.id.clone()],
                ));
            }
            members.push(index);
        }
        if members.len() < 2 {
            return Err(AnalysisError::new(
                "invalid_diaphragm",
                format!("Diaphragm {} cần master và ít nhất một slave", group.name),
                vec![group.id.clone()],
            ));
        }
        let master = members[0];
        let jm = &model.joints[nodes[master]];
        for &slave in &members[1..] {
            let js = &model.joints[nodes[slave]];
            if (jm.z - js.z).abs() > 1e-6 {
                return Err(AnalysisError::new(
                    "invalid_diaphragm",
                    format!("Diaphragm {} có nút khác cao độ", group.name),
                    vec![group.id.clone()],
                ));
            }
            let r = js.restraint.unwrap_or([false; 6]);
            if r[0] || r[1] || r[5] {
                return Err(AnalysisError::new(
                    "invalid_diaphragm",
                    format!(
                        "Diaphragm {}: gối UX/UY/RZ trên slave không được hỗ trợ",
                        group.name
                    ),
                    vec![group.id.clone()],
                ));
            }
            slave_nodes.insert(slave);
            bindings.push((slave, master, js.x - jm.x, js.y - jm.y));
        }
    }
    let pos = |n: usize| -> V3 {
        let j = &model.joints[nodes[n]];
        [j.x, j.y, j.z]
    };

    // ---- đánh số bậc tự do theo thứ tự Cuthill–McKee ngược
    let mut adj = vec![Vec::new(); nodes.len()];
    let pair = |f: &fem_core::Frame| {
        (
            node_of[&joint_by_id[f.i.as_str()]],
            node_of[&joint_by_id[f.j.as_str()]],
        )
    };
    for f in &model.frames {
        let (a, b) = pair(f);
        adj[a].push(b);
        adj[b].push(a);
    }
    for &(slave, master, _, _) in &bindings {
        adj[slave].push(master);
        adj[master].push(slave);
    }
    let order = reverse_cuthill_mckee(&adj);
    let mut dof_of = vec![[None; 6]; nodes.len()];
    let mut dof_owner: Vec<(usize, usize)> = Vec::new();
    for &n in &order {
        let r = model.joints[nodes[n]].restraint.unwrap_or([false; 6]);
        for d in 0..6 {
            if !r[d] && !(slave_nodes.contains(&n) && matches!(d, 0 | 1 | 5)) {
                dof_of[n][d] = Some(dof_owner.len());
                dof_owner.push((n, d));
            }
        }
    }
    let ndof = dof_owner.len();
    let mut dof_weights: Vec<[Vec<(usize, f64)>; 6]> = (0..nodes.len())
        .map(|_| std::array::from_fn(|_| Vec::new()))
        .collect();
    for n in 0..nodes.len() {
        for d in 0..6 {
            if let Some(g) = dof_of[n][d] {
                dof_weights[n][d].push((g, 1.0));
            }
        }
    }
    for &(slave, master, dx, dy) in &bindings {
        dof_weights[slave][0] = dof_weights[master][0].clone();
        dof_weights[slave][1] = dof_weights[master][1].clone();
        if let Some(g) = dof_of[master][5] {
            if dy != 0.0 {
                dof_weights[slave][0].push((g, -dy));
            }
            if dx != 0.0 {
                dof_weights[slave][1].push((g, dx));
            }
        }
        dof_weights[slave][5] = dof_weights[master][5].clone();
    }

    // ---- phần tử
    let materials: HashMap<&str, &fem_core::Material> =
        model.materials.iter().map(|m| (m.id.as_str(), m)).collect();
    let sections: HashMap<&str, &fem_core::FrameSection> = model
        .frame_sections
        .iter()
        .map(|s| (s.id.as_str(), s))
        .collect();
    let mut elems: Vec<Elem> = Vec::with_capacity(model.frames.len());
    let mut self_weight: Vec<f64> = Vec::with_capacity(model.frames.len()); // kN/m
    for f in &model.frames {
        let sec = sections.get(f.section.as_str()).ok_or_else(|| {
            AnalysisError::new(
                "missing_section",
                format!("Thanh {}: thiếu tiết diện", f.label),
                vec![f.id.clone()],
            )
        })?;
        let mat = materials.get(sec.material.as_str()).ok_or_else(|| {
            AnalysisError::new(
                "missing_material",
                format!("Tiết diện {}: thiếu vật liệu", sec.name),
                vec![sec.id.clone()],
            )
        })?;
        let (ji, jj) = pair(f);
        let (a, b) = (pos(ji), pos(jj));
        let full_length = norm(sub(b, a));
        if full_length < 1e-9 {
            return Err(AnalysisError::new(
                "zero_length",
                format!("Thanh {} có chiều dài bằng 0", f.label),
                vec![f.id.clone()],
            ));
        }
        let start = f.offsets.as_ref().map_or(0.0, |o| o.i);
        let end = f.offsets.as_ref().map_or(0.0, |o| o.j);
        if !start.is_finite()
            || !end.is_finite()
            || start < 0.0
            || end < 0.0
            || start + end >= full_length - 1e-9
        {
            return Err(AnalysisError::new(
                "invalid_offsets",
                format!(
                    "Thanh {}: vùng cứng không hợp lệ so với chiều dài thanh",
                    f.label
                ),
                vec![f.id.clone()],
            ));
        }
        let l = full_length - start - end;
        let e1 = scale(sub(b, a), 1.0 / full_length);
        let (offset_i, offset_j) = (scale(e1, start), scale(e1, -end));
        let geometry_ok = match &sec.geometry {
            FrameShape::I { h, bf, tf, tw } => 2.0 * *tf < *h && *tw < *bf,
            FrameShape::Box { h, b, t } => 2.0 * *t < *h && 2.0 * *t < *b,
            FrameShape::Pipe { d, t } => 2.0 * *t < *d,
            _ => true,
        };
        let (area, i22, i33, j) = section_props(&sec.geometry);
        if !geometry_ok
            || [area, i22, i33, j, mat.e]
                .iter()
                .any(|v| !v.is_finite() || *v <= 0.0)
        {
            return Err(AnalysisError::new(
                "invalid_section",
                format!("Tiết diện {} không có đặc trưng hình học hợp lệ", sec.name),
                vec![sec.id.clone()],
            ));
        }
        let props = SectionProps {
            e: mat.e,
            g: mat.e / (2.0 * (1.0 + mat.nu)),
            a: area,
            i22,
            i33,
            j,
        };
        let shear = if let Some(s) = &sec.shear_areas {
            if [s.a2, s.a3]
                .iter()
                .any(|x| !x.is_finite() || *x <= 0.0 || *x > area)
            {
                return Err(AnalysisError::new(
                    "invalid_section",
                    format!("Tiết diện {}: diện tích chịu cắt không hợp lệ", sec.name),
                    vec![sec.id.clone()],
                ));
            }
            Some([s.a2, s.a3])
        } else {
            None
        };
        let k_local = local_stiffness_with_shear(&props, l, shear);
        let mut released = [false; 12];
        if let Some(r) = &f.releases {
            for c in 0..6 {
                released[c] = r.i.get(c).copied().unwrap_or(false);
                released[6 + c] = r.j.get(c).copied().unwrap_or(false);
            }
        }
        let (k_cond, _) = condense(&k_local, &[0.0; 12], &released).map_err(|e| {
            AnalysisError::new(
                "invalid_releases",
                format!("Thanh {}: {}", f.label, e),
                vec![f.id.clone()],
            )
        })?;
        let mut dofs: [Vec<(usize, f64)>; 12] = std::array::from_fn(|_| Vec::new());
        for d in 0..6 {
            dofs[d] = dof_weights[ji][d].clone();
            dofs[6 + d] = dof_weights[jj][d].clone();
        }
        self_weight.push(mat.gamma * area);
        elems.push(Elem {
            id: f.id.clone(),
            ax: local_axes(a, b),
            l,
            k_local,
            released,
            k_cond,
            offset_i,
            offset_j,
            offset_i_length: start,
            dofs,
            ji,
            jj,
        });
    }

    // ---- lắp ghép MPC-reduced stiffness matrix (profile skyline).
    let mut first: Vec<usize> = (0..ndof).collect();
    for e in &elems {
        let involved: Vec<usize> = e.dofs.iter().flatten().map(|(g, _)| *g).collect();
        if let Some(&min) = involved.iter().min() {
            for &g in &involved {
                first[g] = first[g].min(min);
            }
        }
    }
    let mut k = Matrix::new(first);
    let backend = k.backend();
    for e in &elems {
        let kg = rigid_end_stiffness(
            &stiffness_to_global(&e.ax, &e.k_cond),
            e.offset_i,
            e.offset_j,
        );
        // Full a,b loops preserve both K_ab contributions when two DOFs collapse
        // into the same generalized coordinate (rigid diaphragm).
        for a in 0..12 {
            for b in 0..12 {
                if kg[a][b] == 0.0 {
                    continue;
                }
                for &(da, wa) in &e.dofs[a] {
                    for &(db, wb) in &e.dofs[b] {
                        if da <= db {
                            k.add(da, db, kg[a][b] * wa * wb);
                        }
                    }
                }
            }
        }
    }
    // Bậc tự do xoay không có độ cứng (mọi thanh nối vào đều nhả mô men) → thêm lò xo đơn vị và cảnh báo.
    let mut stabilized = Vec::new();
    let mut zero_rotation_dofs = Vec::new();
    for d in 0..ndof {
        if k.get(d, d) == 0.0 && dof_owner[d].1 >= 3 {
            // Chỉ để loại bỏ bậc tự do xoay không có độ cứng và KHÔNG chịu tải.
            // Nếu có mô men đặt vào đây, báo lỗi thay vì biến nó thành lò xo giả.
            k.add(d, d, 1.0);
            zero_rotation_dofs.push(d);
            stabilized.push(model.joints[nodes[dof_owner[d].0]].label.clone());
        }
    }
    if !stabilized.is_empty() {
        stabilized.sort();
        stabilized.dedup();
        warn(
            &mut warnings,
            "free_rotation",
            format!("{} nút có bậc tự do xoay tự do (mọi thanh nối vào đều nhả mô men); đã giữ lại để giải", stabilized.len()),
            stabilized,
        );
    }
    let profile = k.profile();
    if backend == "sparse_pcg_jacobi" {
        warn(&mut warnings, "sparse_pcg",
            "Đã chuyển sang giải thưa PCG; chưa thể coi đây là Cholesky trực tiếp và yêu cầu kiểm tra hội tụ".into(), vec![]);
    }
    k.factor(1e-11).map_err(|s| {
        let (n, d) = dof_owner[s.dof];
        let jt = &model.joints[nodes[n]];
        AnalysisError::new(
            "unstable",
            format!(
                "Kết cấu mất ổn định tại nút {} theo phương {} (thiếu gối hoặc liên kết)",
                jt.label, DOF_NAMES[d]
            ),
            vec![jt.id.clone()],
        )
    })?;

    // ---- tải theo mẫu tải
    let frame_by_id: HashMap<&str, usize> = model
        .frames
        .iter()
        .enumerate()
        .map(|(i, f)| (f.id.as_str(), i))
        .collect();
    let mut edge_frame: HashMap<(usize, usize), usize> = HashMap::new();
    for (i, f) in model.frames.iter().enumerate() {
        let (a, b) = (joint_by_id[f.i.as_str()], joint_by_id[f.j.as_str()]);
        edge_frame.insert((a.min(b), a.max(b)), i);
    }
    let mut lost_joints: Vec<String> = Vec::new();
    let mut patterns: HashMap<&str, PatternLoads> = HashMap::new();
    for lp in &model.load_patterns {
        let mut pl = PatternLoads::default();
        // Lực đặt tại nút (theo chỉ số trong model.joints).
        let add_joint = |pl: &mut PatternLoads, jk: usize, force: V3, lost: &mut Vec<String>| {
            if let Some(&n) = node_of.get(&jk) {
                let e = pl.joint.entry(n).or_insert([0.0; 6]);
                for c in 0..3 {
                    e[c] += force[c];
                }
            } else {
                lost.push(model.joints[jk].label.clone());
            }
        };
        // Trọng lượng bản thân thanh.
        if lp.self_weight != 0.0 {
            for (ei, e) in elems.iter().enumerate() {
                let w = to_local3(&e.ax, [0.0, 0.0, -self_weight[ei] * lp.self_weight]);
                pl.member
                    .entry(ei)
                    .or_default()
                    .push(MemberLoad::Uniform(w));
            }
        }
        // Tải trên thanh.
        for fl in model.frame_loads.iter().filter(|l| l.pattern == lp.id) {
            let Some(&ei) = frame_by_id.get(fl.frame.as_str()) else {
                return Err(AnalysisError::new(
                    "invalid_frame_load",
                    format!("Không có thanh cho tải {}", fl.id),
                    vec![fl.id.clone()],
                ));
            };
            let e = &elems[ei];
            let v = fl.value;
            let w = match fl.direction.as_str() {
                "gravity" => to_local3(&e.ax, [0.0, 0.0, -v]),
                "globalX" => to_local3(&e.ax, [v, 0.0, 0.0]),
                "globalY" => to_local3(&e.ax, [0.0, v, 0.0]),
                "globalZ" => to_local3(&e.ax, [0.0, 0.0, v]),
                "localX" => [v, 0.0, 0.0],
                "local2" => [0.0, v, 0.0],
                _ => [0.0, 0.0, v],
            };
            let ml = if fl.kind == "point" {
                MemberLoad::Point(w, fl.at.unwrap_or(0.5) * e.l)
            } else {
                MemberLoad::Uniform(w)
            };
            pl.member.entry(ei).or_default().push(ml);
        }
        // Tải sàn/vách và trọng lượng bản thân sàn.
        let shell_sections: HashMap<&str, &fem_core::ShellSection> = model
            .shell_sections
            .iter()
            .map(|s| (s.id.as_str(), s))
            .collect();
        for sh in &model.shells {
            let mut q_dirs: Vec<V3> = Vec::new(); // vector tải theo diện tích (kN/m²)
            let corners: Vec<usize> = sh
                .joints
                .iter()
                .filter_map(|id| joint_by_id.get(id.as_str()).copied())
                .collect();
            if corners.len() < 3 {
                continue;
            }
            let pts: Vec<V3> = corners
                .iter()
                .map(|&c| [model.joints[c].x, model.joints[c].y, model.joints[c].z])
                .collect();
            let normal = {
                let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
                let l = norm(n).max(1e-12);
                scale(n, 1.0 / l)
            };
            for l in model
                .shell_loads
                .iter()
                .filter(|l| l.shell == sh.id && l.pattern == lp.id)
            {
                q_dirs.push(match l.direction.as_str() {
                    "gravity" => [0.0, 0.0, -l.value],
                    "globalZ" => [0.0, 0.0, l.value],
                    _ => scale(normal, l.value),
                });
            }
            if lp.self_weight != 0.0 {
                if let Some(ss) = shell_sections.get(sh.section.as_str()) {
                    if let Some(m) = materials.get(ss.material.as_str()) {
                        q_dirs.push([0.0, 0.0, -m.gamma * ss.thickness * lp.self_weight]);
                    }
                }
            }
            if q_dirs.is_empty() {
                continue;
            }
            let q = q_dirs
                .iter()
                .fold([0.0; 3], |a, b| [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
            let areas = edge_tributary(&pts);
            if sh.kind == "wall" {
                let total: f64 = areas.iter().sum();
                let share = scale(q, total / corners.len() as f64);
                for &c in &corners {
                    add_joint(&mut pl, c, share, &mut lost_joints);
                }
                continue;
            }
            for (k, &area) in areas.iter().enumerate() {
                let (a, b) = (corners[k], corners[(k + 1) % corners.len()]);
                let force = scale(q, area);
                if let Some(&fi) = edge_frame.get(&(a.min(b), a.max(b))) {
                    let e = &elems[fi];
                    let w = to_local3(&e.ax, scale(force, 1.0 / e.l));
                    pl.member
                        .entry(fi)
                        .or_default()
                        .push(MemberLoad::Uniform(w));
                } else {
                    add_joint(&mut pl, a, scale(force, 0.5), &mut lost_joints);
                    add_joint(&mut pl, b, scale(force, 0.5), &mut lost_joints);
                }
            }
        }
        patterns.insert(lp.id.as_str(), pl);
    }
    if model.shells.iter().any(|s| s.kind == "wall") {
        warn(&mut warnings, "walls_no_stiffness", "Vách chưa tham gia chịu lực (phần tử shell có ở Giai đoạn 9); tải trên vách chia đều về các nút".into(), vec![]);
    }
    if !lost_joints.is_empty() {
        lost_joints.sort();
        lost_joints.dedup();
        return Err(AnalysisError::new(
            "lost_loads",
            format!(
                "{} nút có tải nhưng không nối với phần tử thanh: dừng phân tích để tránh mất tải",
                lost_joints.len()
            ),
            lost_joints,
        ));
    }

    // ---- giải từng trường hợp tải tĩnh tuyến tính
    let mut cases: Vec<CaseResult> = Vec::new();
    for lc in &model.load_cases {
        if lc.kind != "linearStatic" {
            warn(
                &mut warnings,
                "case_skipped",
                format!(
                    "Trường hợp {} ({}) chưa được hỗ trợ, bỏ qua",
                    lc.name, lc.kind
                ),
                vec![lc.id.clone()],
            );
            continue;
        }
        // Tổng hợp tải của trường hợp.
        let mut joint_loads: HashMap<usize, [f64; 6]> = HashMap::new();
        let mut member_loads: HashMap<usize, Vec<(f64, &MemberLoad)>> = HashMap::new();
        for cl in &lc.loads {
            let Some(pl) = patterns.get(cl.pattern.as_str()) else {
                continue;
            };
            for (&n, v) in &pl.joint {
                let e = joint_loads.entry(n).or_insert([0.0; 6]);
                for c in 0..6 {
                    e[c] += cl.factor * v[c];
                }
            }
            for (&ei, list) in &pl.member {
                member_loads
                    .entry(ei)
                    .or_default()
                    .extend(list.iter().map(|ml| (cl.factor, ml)));
            }
        }
        let mut rhs = vec![0.0; ndof];
        let mut applied = [0.0; 3];
        for (&n, v) in &joint_loads {
            for d in 0..6 {
                for &(g, weight) in &dof_weights[n][d] {
                    rhs[g] += weight * v[d];
                }
            }
            for c in 0..3 {
                applied[c] += v[c];
            }
        }
        let mut feq_cond: HashMap<usize, [f64; 12]> = HashMap::new();
        for (&ei, list) in &member_loads {
            let e = &elems[ei];
            let mut feq = [0.0; 12];
            for &(fac, ml) in list {
                let (f, total) = match ml {
                    MemberLoad::Uniform(w) => (uniform_feq(*w, e.l), scale(*w, e.l)),
                    MemberLoad::Point(p, a) => (point_feq(*p, *a, e.l), *p),
                };
                for c in 0..12 {
                    feq[c] += fac * f[c];
                }
                let tg = from_local3(&e.ax, total);
                for c in 0..3 {
                    applied[c] += fac * tg[c];
                }
            }
            let (_, fc) = condense(&e.k_local, &feq, &e.released).map_err(|msg| {
                AnalysisError::new(
                    "invalid_releases",
                    format!("Thanh {}: {}", e.id, msg),
                    vec![e.id.clone()],
                )
            })?;
            let fg = rigid_end_force(&to_global(&e.ax, &fc), e.offset_i, e.offset_j);
            for c in 0..12 {
                for &(g, weight) in &e.dofs[c] {
                    rhs[g] += weight * fg[c];
                }
            }
            feq_cond.insert(ei, fc);
        }
        let rhs_scale = rhs.iter().map(|x| x.abs()).fold(0.0_f64, f64::max);
        for &d in &zero_rotation_dofs {
            if rhs[d].abs() > 1e-10 * (1.0 + rhs_scale) {
                let (n, direction) = dof_owner[d];
                let joint = &model.joints[nodes[n]];
                return Err(AnalysisError::new(
                    "unrestrained_moment",
                    format!(
                        "Nút {}: mô men đặt vào bậc tự do xoay {} không có độ cứng",
                        joint.label, DOF_NAMES[direction]
                    ),
                    vec![joint.id.clone()],
                ));
            }
        }
        k.solve(&mut rhs).map_err(|err| {
            let (code, msg) = match err {
                SolveError::NonConverged => (
                    "sparse_no_convergence",
                    "PCG thưa không hội tụ trong giới hạn; không xuất kết quả".to_string(),
                ),
                SolveError::Indefinite => (
                    "sparse_indefinite",
                    "Ma trận không xác định dương hoặc có cơ cấu mất ổn định".to_string(),
                ),
            };
            AnalysisError::new(code, msg, vec![])
        })?;
        let u = rhs;

        let disp_of = |n: usize| -> [f64; 6] {
            let mut d = [0.0; 6];
            for c in 0..6 {
                d[c] = dof_weights[n][c]
                    .iter()
                    .map(|&(g, weight)| weight * u[g])
                    .sum();
            }
            d
        };
        let mut displacements = BTreeMap::new();
        for n in 0..nodes.len() {
            displacements.insert(model.joints[nodes[n]].id.clone(), disp_of(n));
        }
        // Lực đầu thanh và phản lực.
        let mut joint_sum: Vec<[f64; 6]> = vec![[0.0; 6]; nodes.len()];
        let mut frames = BTreeMap::new();
        for (ei, e) in elems.iter().enumerate() {
            let (di, dj) = (disp_of(e.ji), disp_of(e.jj));
            let mut ug = [0.0; 12];
            ug[..6].copy_from_slice(&di);
            ug[6..].copy_from_slice(&dj);
            let ug_end = rigid_end_displacement(&ug, e.offset_i, e.offset_j);
            let ul = to_local(&e.ax, &ug_end);
            let mut fl = [0.0; 12];
            for a in 0..12 {
                fl[a] = (0..12).map(|b| e.k_cond[a][b] * ul[b]).sum::<f64>()
                    - feq_cond.get(&ei).map_or(0.0, |f| f[a]);
            }
            let fg = rigid_end_force(&to_global(&e.ax, &fl), e.offset_i, e.offset_j);
            for c in 0..6 {
                joint_sum[e.ji][c] += fg[c];
                joint_sum[e.jj][c] += fg[6 + c];
            }
            let loads: Vec<(f64, &MemberLoad)> = member_loads.get(&ei).cloned().unwrap_or_default();
            let mut frame_forces = stations(&fl, &loads, e.l, opts.stations.max(2));
            for x in &mut frame_forces.x {
                *x += e.offset_i_length;
            }
            frames.insert(e.id.clone(), frame_forces);
        }
        // Nội lực - ngoại lực tại mỗi nút. Chuyển phản lực ràng buộc slave
        // về master (kèm mô men do cánh tay đòn), tránh mất cân bằng lực.
        let mut residual = joint_sum;
        for (&n, loads) in &joint_loads {
            for c in 0..6 {
                residual[n][c] -= loads[c];
            }
        }
        for &(slave, master, dx, dy) in &bindings {
            let r = residual[slave];
            residual[master][0] += r[0];
            residual[master][1] += r[1];
            residual[master][5] += r[5] + dx * r[1] - dy * r[0];
        }
        let mut reactions = BTreeMap::new();
        let mut sum_reactions = [0.0; 3];
        for n in 0..nodes.len() {
            let jt = &model.joints[nodes[n]];
            let Some(r) = jt.restraint else { continue };
            if !r.iter().any(|x| *x) {
                continue;
            }
            let mut rv = [0.0; 6];
            for c in 0..6 {
                if r[c] {
                    rv[c] = residual[n][c];
                }
            }
            for c in 0..3 {
                sum_reactions[c] += rv[c];
            }
            reactions.insert(jt.id.clone(), rv);
        }
        cases.push(CaseResult {
            id: lc.id.clone(),
            name: lc.name.clone(),
            kind: "case".into(),
            displacements,
            reactions,
            frames,
            applied,
            sum_reactions,
        });
    }

    // ---- tổ hợp cộng tuyến tính: giải theo quan hệ phụ thuộc, không phụ thuộc thứ tự khai báo.
    let mut pending: Vec<&fem_core::LoadCombo> = Vec::new();
    for co in &model.combos {
        if matches!(co.kind.as_str(), "linearAdd" | "envelope" | "srss") {
            pending.push(co);
        } else {
            warn(
                &mut warnings,
                "combo_skipped",
                format!("Tổ hợp {} ({}) chưa được hỗ trợ, bỏ qua", co.name, co.kind),
                vec![co.id.clone()],
            );
        }
    }
    // Không được cộng đại số một kết quả bao/SRSS: đây là cực trị hoặc đại lượng
    // thống kê theo thành phần, không phải trường hợp tải có nội lực đồng thời.
    for co in &pending {
        for part in &co.items {
            if let Some(parent) = model.combos.iter().find(|p| p.id == part.case) {
                if parent.kind != "linearAdd" {
                    return Err(AnalysisError::new(
                        "nonlinear_combo_dependency",
                        format!(
                            "Tổ hợp {} không được lồng kết quả {} ({})",
                            co.name, parent.name, parent.kind
                        ),
                        vec![co.id.clone(), parent.id.clone()],
                    ));
                }
            }
        }
    }
    while !pending.is_empty() {
        let before = pending.len();
        pending.retain(|co| {
            let parts: Vec<(f64, &CaseResult)> = co
                .items
                .iter()
                .filter_map(|it| {
                    cases
                        .iter()
                        .find(|c| c.id == it.case)
                        .map(|c| (it.factor, c))
                })
                .collect();
            if parts.len() != co.items.len() {
                return true;
            }
            if parts.is_empty() {
                return true; // Chặn tổ hợp trống phía dưới.
            }
            let computed = match co.kind.as_str() {
                "linearAdd" => vec![combine(co.id.clone(), co.name.clone(), &parts)],
                "srss" => vec![nonlinear_combine(
                    co.id.clone(),
                    co.name.clone(),
                    &parts,
                    "srss",
                )],
                "envelope" => vec![
                    nonlinear_combine(
                        format!("{}:max", co.id),
                        format!("{} [MAX]", co.name),
                        &parts,
                        "envelopeMax",
                    ),
                    nonlinear_combine(
                        format!("{}:min", co.id),
                        format!("{} [MIN]", co.name),
                        &parts,
                        "envelopeMin",
                    ),
                ],
                _ => unreachable!(),
            };
            cases.extend(computed);
            false
        });
        if pending.len() == before {
            let stuck = pending
                .iter()
                .map(|x| x.name.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            return Err(AnalysisError::new(
                "combo_dependency",
                format!(
                    "Tổ hợp tải có phụ thuộc vòng hoặc thành phần chưa tính được: {}",
                    stuck
                ),
                pending.iter().map(|x| x.id.clone()).collect(),
            ));
        }
    }

    Ok(Results {
        dof: ndof,
        joints: nodes.len(),
        frames: elems.len(),
        profile,
        cases,
        warnings,
    })
}

fn to_local3(ax: &[V3; 3], g: V3) -> V3 {
    [dot(ax[0], g), dot(ax[1], g), dot(ax[2], g)]
}
fn from_local3(ax: &[V3; 3], l: V3) -> V3 {
    [0, 1, 2].map(|c| ax[0][c] * l[0] + ax[1][c] * l[1] + ax[2][c] * l[2])
}

/// Diện tích truyền tải về từng cạnh của đa giác (cạnh k nối đỉnh k và k+1).
pub fn edge_tributary(pts: &[V3]) -> Vec<f64> {
    let n = pts.len();
    if n == 4 {
        let e: Vec<V3> = (0..4).map(|k| sub(pts[(k + 1) % 4], pts[k])).collect();
        let right = (0..4)
            .all(|k| dot(e[k], e[(k + 1) % 4]).abs() < 1e-6 * norm(e[k]) * norm(e[(k + 1) % 4]));
        if right {
            // Quy tắc 45°: cạnh ngắn nhận tam giác, cạnh dài nhận hình thang.
            let (l0, l1) = (norm(e[0]), norm(e[1]));
            let (a, b) = (l0.min(l1), l0.max(l1));
            let tri = a * a / 4.0;
            let trap = a * b / 2.0 - tri;
            return (0..4)
                .map(|k| {
                    if (norm(e[k]) - a).abs() < 1e-9 * b {
                        tri
                    } else {
                        trap
                    }
                })
                .collect();
        }
    }
    let c = pts
        .iter()
        .fold([0.0; 3], |s, p| [s[0] + p[0], s[1] + p[1], s[2] + p[2]]);
    let c = scale(c, 1.0 / n as f64);
    (0..n)
        .map(|k| norm(cross(sub(pts[k], c), sub(pts[(k + 1) % n], c))) / 2.0)
        .collect()
}

/// Nội lực tại các điểm chia đều dọc thanh từ lực đầu i (cục bộ) và tải trên thanh.
fn stations(f: &[f64; 12], loads: &[(f64, &MemberLoad)], l: f64, n: usize) -> FrameForces {
    let mut out = FrameForces::default();
    for s in 0..n {
        let x = l * s as f64 / (n - 1) as f64;
        // Lực và mô men trên mặt cắt (đoạn [0, x]): F = -(f_i + ∫w), M = -(m_i + r_i×f_i + Σ r×w).
        let mut fsum = [f[0], f[1], f[2]];
        let mut msum = [f[3], f[4] + x * f[2], f[5] - x * f[1]];
        for &(fac, ml) in loads {
            match ml {
                MemberLoad::Uniform(w) => {
                    for c in 0..3 {
                        fsum[c] += fac * w[c] * x;
                    }
                    msum[1] += fac * w[2] * x * x / 2.0;
                    msum[2] -= fac * w[1] * x * x / 2.0;
                }
                MemberLoad::Point(p, a) => {
                    if *a <= x + 1e-12 {
                        for c in 0..3 {
                            fsum[c] += fac * p[c];
                        }
                        let r = a - x;
                        msum[1] -= fac * r * p[2];
                        msum[2] += fac * r * p[1];
                    }
                }
            }
        }
        out.x.push(x);
        out.p.push(-fsum[0]);
        out.v2.push(-fsum[1]);
        out.v3.push(-fsum[2]);
        out.t.push(-msum[0]);
        out.m2.push(-msum[1]);
        out.m3.push(-msum[2]);
    }
    out
}

fn combine(id: String, name: String, parts: &[(f64, &CaseResult)]) -> CaseResult {
    let (_, base) = parts[0];
    let mut r = CaseResult {
        id,
        name,
        kind: "combo".into(),
        displacements: base
            .displacements
            .keys()
            .map(|k| (k.clone(), [0.0; 6]))
            .collect(),
        reactions: base
            .reactions
            .keys()
            .map(|k| (k.clone(), [0.0; 6]))
            .collect(),
        frames: BTreeMap::new(),
        applied: [0.0; 3],
        sum_reactions: [0.0; 3],
    };
    for &(fac, c) in parts {
        for (k, v) in &c.displacements {
            let e = r.displacements.entry(k.clone()).or_insert([0.0; 6]);
            for i in 0..6 {
                e[i] += fac * v[i];
            }
        }
        for (k, v) in &c.reactions {
            let e = r.reactions.entry(k.clone()).or_insert([0.0; 6]);
            for i in 0..6 {
                e[i] += fac * v[i];
            }
        }
        for (k, v) in &c.frames {
            let e = r.frames.entry(k.clone()).or_insert_with(|| FrameForces {
                x: v.x.clone(),
                p: vec![0.0; v.x.len()],
                v2: vec![0.0; v.x.len()],
                v3: vec![0.0; v.x.len()],
                t: vec![0.0; v.x.len()],
                m2: vec![0.0; v.x.len()],
                m3: vec![0.0; v.x.len()],
            });
            for (dst, src) in [
                (&mut e.p, &v.p),
                (&mut e.v2, &v.v2),
                (&mut e.v3, &v.v3),
                (&mut e.t, &v.t),
                (&mut e.m2, &v.m2),
                (&mut e.m3, &v.m3),
            ] {
                for (a, b) in dst.iter_mut().zip(src) {
                    *a += fac * b;
                }
            }
        }
        for i in 0..3 {
            r.applied[i] += fac * c.applied[i];
            r.sum_reactions[i] += fac * c.sum_reactions[i];
        }
    }
    r
}

/// Tính từng thành phần của envelope (MAX/MIN) hoặc SRSS. Các cực trị không
/// đồng thời, tổng tải/tổng phản lực **không** được dùng để kiểm tra cân bằng.
/// SRSS ở đây là phép cộng căn tổng bình phương của các CASE tĩnh độc lập,
/// không thay thế phân tích phổ phản ứng/modal.
fn nonlinear_value<I: Iterator<Item = f64>>(values: I, kind: &str) -> f64 {
    match kind {
        "envelopeMax" => values.fold(f64::NEG_INFINITY, f64::max),
        "envelopeMin" => values.fold(f64::INFINITY, f64::min),
        "srss" => values.map(|v| v * v).sum::<f64>().sqrt(),
        _ => unreachable!(),
    }
}

fn nonlinear_combine(
    id: String,
    name: String,
    parts: &[(f64, &CaseResult)],
    kind: &str,
) -> CaseResult {
    let base = parts[0].1;
    let aggregate = |values: Vec<f64>| nonlinear_value(values.into_iter(), kind);
    let displacements = base
        .displacements
        .keys()
        .map(|id| {
            (
                id.clone(),
                std::array::from_fn(|i| {
                    aggregate(
                        parts
                            .iter()
                            .map(|(fac, c)| fac * c.displacements[id][i])
                            .collect(),
                    )
                }),
            )
        })
        .collect();
    let reactions = base
        .reactions
        .keys()
        .map(|id| {
            (
                id.clone(),
                std::array::from_fn(|i| {
                    aggregate(
                        parts
                            .iter()
                            .map(|(fac, c)| fac * c.reactions[id][i])
                            .collect(),
                    )
                }),
            )
        })
        .collect();
    let frames = base
        .frames
        .iter()
        .map(|(id, v)| {
            let series = |get: fn(&FrameForces) -> &Vec<f64>| -> Vec<f64> {
                (0..v.x.len())
                    .map(|i| {
                        aggregate(
                            parts
                                .iter()
                                .map(|(fac, c)| fac * get(&c.frames[id])[i])
                                .collect(),
                        )
                    })
                    .collect()
            };
            (
                id.clone(),
                FrameForces {
                    x: v.x.clone(),
                    p: series(|f| &f.p),
                    v2: series(|f| &f.v2),
                    v3: series(|f| &f.v3),
                    t: series(|f| &f.t),
                    m2: series(|f| &f.m2),
                    m3: series(|f| &f.m3),
                },
            )
        })
        .collect();
    CaseResult {
        id,
        name,
        kind: kind.into(),
        displacements,
        reactions,
        frames,
        // Không có ý nghĩa cân bằng vì các thành phần không đồng thời.
        applied: [0.0; 3],
        sum_reactions: [0.0; 3],
    }
}

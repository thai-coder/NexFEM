//! Kiểu dữ liệu mô hình, khớp với `packages/model-core/schema/model.schema.json`.
//! Đơn vị nội bộ: kN, m.

use serde::{Deserialize, Serialize};

pub const MODEL_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub schema_version: u32,
    pub name: String,
    pub units: UnitSystem,
    #[serde(default)]
    pub design_codes: DesignCodes,
    pub grids: Vec<GridSystem>,
    pub stories: Vec<Story>,
    pub materials: Vec<Material>,
    pub frame_sections: Vec<FrameSection>,
    pub shell_sections: Vec<ShellSection>,
    pub joints: Vec<Joint>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diaphragms: Vec<Diaphragm>,
    pub frames: Vec<Frame>,
    pub shells: Vec<Shell>,
    pub load_patterns: Vec<LoadPattern>,
    pub load_cases: Vec<LoadCase>,
    pub combos: Vec<LoadCombo>,
    #[serde(default)]
    pub frame_loads: Vec<FrameLoad>,
    #[serde(default)]
    pub shell_loads: Vec<ShellLoad>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnitSystem {
    pub force: String,
    pub length: String,
    pub temperature: String,
}

/// Tiêu chuẩn thiết kế đã chọn cho dự án.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct DesignCodes {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub concrete: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loads: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GridLine {
    pub id: String,
    pub label: String,
    pub coord: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GridSystem {
    pub id: String,
    pub name: String,
    pub x: Vec<GridLine>,
    pub y: Vec<GridLine>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Story {
    pub id: String,
    pub name: String,
    pub elevation: f64,
    pub height: f64,
    #[serde(default)]
    pub master_story: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub similar_to: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MaterialType {
    Concrete,
    Steel,
    Rebar,
    Other,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: MaterialType,
    /// Mô đun đàn hồi (kN/m²).
    #[serde(rename = "E")]
    pub e: f64,
    pub nu: f64,
    /// Trọng lượng riêng (kN/m³).
    pub gamma: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

fn is_zero(v: &f64) -> bool {
    *v == 0.0
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "shape")]
pub enum FrameShape {
    #[serde(rename = "rect")]
    Rect { b: f64, h: f64 },
    #[serde(rename = "circle")]
    Circle { d: f64 },
    #[serde(rename = "I")]
    I {
        h: f64,
        bf: f64,
        tf: f64,
        tw: f64,
        /// Bán kính lượn chân (m); 0 = tiết diện hàn không có góc lượn.
        #[serde(default, skip_serializing_if = "is_zero")]
        r: f64,
    },
    #[serde(rename = "box")]
    Box { h: f64, b: f64, t: f64 },
    #[serde(rename = "pipe")]
    Pipe { d: f64, t: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameSection {
    pub id: String,
    pub name: String,
    pub material: String,
    pub geometry: FrameShape,
    /// Opt-in diện tích chịu cắt hữu hiệu dọc 2/3 (m²); None = Euler–Bernoulli.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shear_areas: Option<ShearAreas>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShearAreas {
    pub a2: f64,
    pub a3: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShellSection {
    pub id: String,
    pub name: String,
    pub material: String,
    pub kind: String,
    pub formulation: String,
    pub thickness: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Joint {
    pub id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub story: Option<String>,
    /// Bậc tự do bị giữ: [Ux, Uy, Uz, Rx, Ry, Rz].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restraint: Option<[bool; 6]>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Diaphragm {
    pub id: String,
    pub name: String,
    pub master: String,
    pub slaves: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FrameKind {
    Beam,
    Column,
    Brace,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Frame {
    pub id: String,
    pub label: String,
    pub kind: FrameKind,
    pub i: String,
    pub j: String,
    pub section: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub story: Option<String>,
    /// Nhả liên kết đầu i / j: [P, V2, V3, T, M2, M3].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub releases: Option<Releases>,
    /// Rigid end zones từ tim nút dọc trục thanh (m).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offsets: Option<FrameOffsets>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameOffsets {
    pub i: f64,
    pub j: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Releases {
    pub i: Vec<bool>,
    pub j: Vec<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Shell {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub joints: Vec<String>,
    pub section: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub story: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadPattern {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub self_weight: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CaseLoad {
    pub pattern: String,
    pub factor: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LoadCase {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub loads: Vec<CaseLoad>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ComboItem {
    pub case: String,
    pub factor: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LoadCombo {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub items: Vec<ComboItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameLoad {
    pub id: String,
    pub frame: String,
    pub pattern: String,
    pub kind: String,
    pub direction: String,
    pub value: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShellLoad {
    pub id: String,
    pub shell: String,
    pub pattern: String,
    pub direction: String,
    pub value: f64,
}

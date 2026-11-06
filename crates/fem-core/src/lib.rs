//! Lõi mô hình kết cấu của NexFEM.
//!
//! Giai đoạn 0: kiểu dữ liệu mô hình dùng chung với frontend và vài hàm hình học cơ bản.
//! Phần tử hữu hạn (frame 3D, shell) được bổ sung ở Giai đoạn 5.

pub mod model;

use std::collections::HashMap;

pub use model::*;

/// Lỗi khi đọc mô hình.
#[derive(Debug)]
pub enum ModelError {
    Json(serde_json::Error),
    UnsupportedVersion(u32),
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelError::Json(e) => write!(f, "file mô hình không hợp lệ: {e}"),
            ModelError::UnsupportedVersion(v) => write!(f, "không hỗ trợ schema phiên bản {v}"),
        }
    }
}

impl std::error::Error for ModelError {}

impl Model {
    /// Đọc mô hình từ chuỗi JSON và kiểm tra phiên bản schema.
    pub fn from_json(s: &str) -> Result<Self, ModelError> {
        let m: Model = serde_json::from_str(s).map_err(ModelError::Json)?;
        if m.schema_version != MODEL_SCHEMA_VERSION {
            return Err(ModelError::UnsupportedVersion(m.schema_version));
        }
        Ok(m)
    }

    pub fn joint_map(&self) -> HashMap<&str, &Joint> {
        self.joints.iter().map(|j| (j.id.as_str(), j)).collect()
    }

    /// Chiều dài thanh (m), `None` nếu thiếu nút.
    pub fn frame_length(&self, frame: &Frame) -> Option<f64> {
        let joints = self.joint_map();
        let a = joints.get(frame.i.as_str())?;
        let b = joints.get(frame.j.as_str())?;
        Some(((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt())
    }

    /// Số bậc tự do tự do (chưa bị gối giữ), 6 bậc mỗi nút.
    pub fn free_dofs(&self) -> usize {
        self.joints
            .iter()
            .map(|j| j.restraint.map_or(6, |r| r.iter().filter(|x| !**x).count()))
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Model {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../resources/templates/sample-frame.json"
        );
        let s = std::fs::read_to_string(path).expect("chạy `pnpm gen` để sinh sample-frame.json");
        Model::from_json(&s).expect("đọc được mô hình mẫu")
    }

    #[test]
    fn reads_sample_model_from_typescript() {
        let m = sample();
        assert_eq!(m.name, "Toa_nha_A");
        // Lưới 4 x 3, Base + 5 tầng.
        assert_eq!(m.joints.len(), 4 * 3 * 6);
        assert_eq!(
            m.frames
                .iter()
                .filter(|f| f.kind == FrameKind::Column)
                .count(),
            12 * 5
        );
        assert_eq!(m.shells.len(), 3 * 2 * 5);
        assert!(matches!(
            m.frame_sections[0].geometry,
            FrameShape::Rect { .. }
        ));
        assert_eq!(m.design_codes.concrete.as_deref(), Some("TCVN 5574:2018"));
    }

    #[test]
    fn frame_lengths_and_dofs() {
        let m = sample();
        let col = m
            .frames
            .iter()
            .find(|f| f.kind == FrameKind::Column)
            .unwrap();
        assert!((m.frame_length(col).unwrap() - 3.9).abs() < 1e-9);
        // 12 nút chân ngàm không có bậc tự do.
        assert_eq!(m.free_dofs(), 12 * 5 * 6);
    }

    #[test]
    fn round_trip_json() {
        let m = sample();
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(Model::from_json(&s).unwrap(), m);
    }

    #[test]
    fn rejects_unknown_version() {
        let mut v: serde_json::Value = serde_json::to_value(sample()).unwrap();
        v["schemaVersion"] = 99.into();
        assert!(matches!(
            Model::from_json(&v.to_string()),
            Err(ModelError::UnsupportedVersion(99))
        ));
    }
}

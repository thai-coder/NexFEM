#![allow(clippy::needless_range_loop, clippy::manual_memcpy)]
//! Bộ giải phân tích tĩnh tuyến tính khung 3D của NexFEM.

pub mod analysis;
pub mod element;
pub mod matrix;
pub mod skyline;

pub use analysis::{analyze, AnalysisError, CaseResult, FrameForces, Options, Results, Warning};

/// Phân tích từ chuỗi JSON mô hình, trả về JSON `{ ok: true, results }` hoặc `{ ok: false, error }`.
pub fn analyze_json(model_json: &str) -> String {
    let out = match fem_core::Model::from_json(model_json) {
        Err(e) => {
            serde_json::json!({ "ok": false, "error": { "code": "invalid_model", "message": e.to_string() } })
        }
        Ok(m) => match analyze(&m, &Options::default()) {
            Ok(r) => serde_json::json!({ "ok": true, "results": r }),
            Err(e) => serde_json::json!({ "ok": false, "error": e }),
        },
    };
    out.to_string()
}

#[cfg(test)]
mod benchmarks;

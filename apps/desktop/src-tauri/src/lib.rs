//! Backend Tauri của NexFEM.
//!
//! Giai đoạn 1 chỉ có lệnh thông tin ứng dụng và kiểm tra mô hình phía Rust.
//! API cục bộ (Giai đoạn 7) và lời gọi solver (Giai đoạn 5) sẽ thêm vào đây.

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    version: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[derive(Serialize)]
struct ModelStats {
    joints: usize,
    frames: usize,
    shells: usize,
    free_dofs: usize,
}

/// Đọc mô hình JSON bằng lõi Rust (fem-core) và trả về thống kê; dùng để kiểm tra cầu nối frontend ↔ Rust.
#[tauri::command]
fn model_stats(json: String) -> Result<ModelStats, String> {
    let m = fem_core::Model::from_json(&json).map_err(|e| e.to_string())?;
    Ok(ModelStats {
        joints: m.joints.len(),
        frames: m.frames.len(),
        shells: m.shells.len(),
        free_dofs: m.free_dofs(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info, model_stats])
        .run(tauri::generate_context!())
        .expect("không khởi động được NexFEM");
}

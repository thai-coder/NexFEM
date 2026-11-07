//! Backend Tauri của NexFEM.
//!
//! Giai đoạn 2: đọc/ghi file dự án `.nxf`. Frontend lo nén/giải nén và kiểm tra schema;
//! backend chỉ đọc/ghi byte, giới hạn ở đuôi file của NexFEM.
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

/// Frontend gọi lệnh này khi giao diện đã dựng xong.
///
/// Khi biến môi trường `NEXFEM_SMOKE_TEST` trỏ tới một file, app ghi thông tin khởi động
/// (phiên bản, tài khoản Windows, thư mục dữ liệu riêng của tài khoản) vào file đó rồi thoát.
/// CI dùng chế độ này để kiểm tra bản đã cài chạy được với từng tài khoản trên máy.
#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let Ok(out) = std::env::var("NEXFEM_SMOKE_TEST") else {
        return Ok(());
    };
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let report = serde_json::json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "user": std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default(),
        "exe": std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default(),
        "appLocalData": data_dir,
    });
    std::fs::write(&out, report.to_string()).map_err(|e| format!("{out}: {e}"))?;
    // Trong phiên không có màn hình (Task Scheduler), WebView2 có thể giữ vòng lặp sự kiện
    // không thoát; buộc thoát sau 5 giây để tiến trình không treo lại.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(5));
        std::process::exit(0);
    });
    app.exit(0);
    Ok(())
}

/// Ở chế độ tự kiểm tra, ghi lỗi panic (kèm backtrace) ra `<NEXFEM_SMOKE_TEST>.panic.txt`
/// vì bản release trên Windows không có cửa sổ console để in lỗi.
fn install_smoke_panic_hook() {
    let Ok(out) = std::env::var("NEXFEM_SMOKE_TEST") else {
        return;
    };
    let crash = format!("{out}.panic.txt");
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let _ = std::fs::write(&crash, format!("{info}\n\n{bt}"));
        default(info);
    }));
}

const ALLOWED_EXTENSIONS: [&str; 2] = ["nxf", "json"];
/// Giới hạn kích thước file dự án khi đọc (512 MB).
const MAX_PROJECT_BYTES: u64 = 512 * 1024 * 1024;

fn check_extension(path: &std::path::Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        Ok(())
    } else {
        Err(format!(
            "chỉ mở/lưu được file .nxf hoặc .json (nhận: {})",
            path.display()
        ))
    }
}

/// Đọc nội dung file dự án.
#[tauri::command]
fn read_project_file(path: String) -> Result<Vec<u8>, String> {
    let p = std::path::Path::new(&path);
    check_extension(p)?;
    let meta = std::fs::metadata(p).map_err(|e| format!("{}: {e}", p.display()))?;
    if meta.len() > MAX_PROJECT_BYTES {
        return Err("file quá lớn".into());
    }
    std::fs::read(p).map_err(|e| format!("{}: {e}", p.display()))
}

/// Ghi file dự án an toàn: ghi ra file tạm cùng thư mục rồi đổi tên, tránh hỏng file khi đang ghi thì mất điện.
#[tauri::command]
fn write_project_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    check_extension(p)?;
    write_atomic(p, &data).map_err(|e| format!("{}: {e}", p.display()))
}

fn write_atomic(path: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let dir = path
        .parent()
        .filter(|d| !d.as_os_str().is_empty())
        .unwrap_or(std::path::Path::new("."));
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project");
    let tmp = dir.join(format!(".{name}.tmp"));
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_smoke_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_info,
            model_stats,
            frontend_ready,
            read_project_file,
            write_project_file
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được NexFEM");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_other_extensions() {
        assert!(check_extension(std::path::Path::new("a/b.nxf")).is_ok());
        assert!(check_extension(std::path::Path::new("a/b.JSON")).is_ok());
        assert!(check_extension(std::path::Path::new("a/b.exe")).is_err());
        assert!(check_extension(std::path::Path::new("a/noext")).is_err());
    }

    #[test]
    fn atomic_write_round_trip() {
        let dir = std::env::temp_dir().join(format!("nexfem-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("model.nxf");
        write_project_file(path.to_string_lossy().into(), vec![1, 2, 3]).unwrap();
        write_project_file(path.to_string_lossy().into(), vec![4, 5]).unwrap();
        assert_eq!(
            read_project_file(path.to_string_lossy().into()).unwrap(),
            vec![4, 5]
        );
        assert!(!dir.join(".model.nxf.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

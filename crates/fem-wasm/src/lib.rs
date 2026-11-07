//! Giao diện WebAssembly tối giản cho bộ giải (không cần wasm-bindgen):
//!
//! 1. JS gọi `alloc(n)` lấy vùng nhớ, chép chuỗi JSON mô hình (UTF-8) vào đó.
//! 2. JS gọi `analyze(ptr, n)`; hàm trả về độ dài chuỗi JSON kết quả.
//! 3. JS đọc kết quả tại `result_ptr()`, rồi gọi `dealloc(ptr, n)` để trả vùng nhớ đầu vào.

use std::cell::RefCell;

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr`, `len` phải là vùng nhớ do `alloc(len)` cấp và chưa được trả.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// # Safety
/// `ptr` trỏ tới `len` byte hợp lệ (chuỗi JSON UTF-8) do JS ghi vào vùng `alloc`.
#[no_mangle]
pub unsafe extern "C" fn analyze(ptr: *const u8, len: usize) -> usize {
    let bytes = std::slice::from_raw_parts(ptr, len);
    let out = match std::str::from_utf8(bytes) {
        Ok(s) => fem_solver::analyze_json(s),
        Err(_) => r#"{"ok":false,"error":{"code":"invalid_utf8","message":"Dữ liệu vào không phải UTF-8"}}"#.to_string(),
    };
    RESULT.with(|r| {
        let mut r = r.borrow_mut();
        *r = out.into_bytes();
        r.len()
    })
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

/// Phiên bản bộ giải (để giao diện hiển thị).
#[no_mangle]
pub extern "C" fn solver_version() -> u32 {
    1
}

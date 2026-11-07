/** Cầu nối tới backend Tauri. Khi chạy trong trình duyệt (dev, kiểm thử) các hàm này không làm gì. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

export interface AppInfo {
  version: string;
  os: string;
  arch: string;
}

export async function appInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppInfo>("app_info");
}

/**
 * Đăng ký xử lý khi người dùng đóng cửa sổ; `allow()` có thể bất đồng bộ, trả về false để giữ cửa sổ.
 * Nếu cho phép, Tauri tự gọi `destroy()` (cần quyền core:window:allow-destroy).
 */
export async function onCloseRequested(allow: () => boolean | Promise<boolean>): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onCloseRequested(async (e) => {
    if (!(await allow())) e.preventDefault();
  });
}

/** Báo cho backend biết giao diện đã sẵn sàng (dùng cho kiểm tra sau cài đặt). */
export async function notifyReady(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const closeMode = await invoke<boolean>("frontend_ready").catch(() => false);
  if (closeMode) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }
}

/** Hộp hỏi Có/Không: hộp thoại hệ điều hành trong Tauri (window.confirm không đáng tin trong WebView2). */
export async function askYesNo(message: string): Promise<boolean> {
  if (isTauri()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, { title: "NexFEM", kind: "warning" });
  }
  return window.confirm(message);
}

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

/** Đăng ký xử lý khi người dùng đóng cửa sổ; `allow()` trả về false để giữ cửa sổ. */
export async function onCloseRequested(allow: () => boolean): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onCloseRequested((e) => {
    if (!allow()) e.preventDefault();
  });
}

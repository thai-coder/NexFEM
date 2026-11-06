/** Đọc/ghi tuỳ chọn giao diện vào localStorage. Lỗi (chế độ riêng tư, bị chặn) thì bỏ qua. */
const PREFIX = "nexfem:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* bỏ qua */
  }
}

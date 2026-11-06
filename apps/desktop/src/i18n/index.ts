import { useUi } from "../stores/ui.ts";
import { en } from "./en.ts";
import { vi, type Strings } from "./vi.ts";

export type Lang = "vi" | "en";
const dicts: Record<Lang, Strings> = { vi, en };

export type T = Strings & { fmt(s: string, params?: Record<string, string | number>): string };

function format(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

const cache = new Map<Lang, T>();
export function strings(lang: Lang): T {
  let v = cache.get(lang);
  if (!v) cache.set(lang, (v = { ...dicts[lang], fmt: format }));
  return v;
}

/** Hook lấy chuỗi giao diện theo ngôn ngữ hiện hành. */
export function useT(): T {
  const lang = useUi((s) => s.lang);
  return strings(lang);
}

/** Dùng ngoài React (lệnh, log). */
export function t(): T {
  return strings(useUi.getState().lang);
}

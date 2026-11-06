export { Icon, type IconName, type IconProps } from "./Icon.tsx";

/** Đọc giá trị design token hiện hành (sau khi đổi theme). */
export function readToken(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

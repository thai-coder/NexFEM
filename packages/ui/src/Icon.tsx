import type { CSSProperties, ReactElement } from "react";

/**
 * Bộ biểu tượng riêng của NexFEM (SVG 20×20, nét 1.6). Vẽ theo ký hiệu kết cấu, không dùng thư viện ngoài.
 */
const paths: Record<string, ReactElement> = {
  new: <path d="M5 2.5h6.5L15 6v11.5H5zM11.5 2.5V6H15M10 9v6M7 12h6" />,
  open: <path d="M2.5 5.5v10h13l2-7H6l-2 7M2.5 5.5V4h5l1.5 1.5h6V8.5" />,
  save: <path d="M3.5 3.5h10l3 3v10h-13zM6.5 3.5v4h6v-4M6.5 16.5v-5h7v5" />,
  undo: <path d="M7 5L3.5 8.5 7 12M3.5 8.5H12a4.5 4.5 0 010 9H8" />,
  redo: <path d="M13 5l3.5 3.5L13 12M16.5 8.5H8a4.5 4.5 0 000 9h4" />,
  select: <path d="M4 3l11 6.2-4.6 1.3L8 15.5z" />,
  joint: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" />
    </>
  ),
  beam: <path d="M2.5 8h15v4h-15zM2.5 8l2 2-2 2M17.5 8l-2 2 2 2" />,
  column: <path d="M8 2.5h4v15H8zM5.5 17.5h9M5.5 2.5h9" />,
  brace: <path d="M3.5 3.5h13v13h-13zM3.5 16.5l13-13" />,
  slab: <path d="M2.5 12.5L7 7.5h10.5L13 12.5zM2.5 12.5v2h10.5v-2M13 14.5l4.5-5v-2" />,
  wall: <path d="M5 2.5h10v15H5zM5 7.5h10M5 12.5h10M10 2.5v5M7.5 7.5v5M12.5 7.5v5M10 12.5v5" />,
  snap: (
    <>
      <path d="M3 3h5v5H3zM12 12h5v5h-5z" />
      <path d="M8 8l4 4" strokeDasharray="1.5 1.5" />
    </>
  ),
  plan: <path d="M3 3h14v14H3zM3 8h14M3 13h14M8 3v14M13 3v14" />,
  elevation: <path d="M3 17.5h14M5 17.5V4M15 17.5V4M5 7.5h10M5 12.5h10" />,
  view3d: <path d="M10 2.5l7 4v7l-7 4-7-4v-7zM3 6.5l7 4 7-4M10 10.5v7" />,
  run: <path d="M6 3.5l11 6.5-11 6.5z" />,
  lock: <path d="M5 9h10v8.5H5zM7 9V6.5a3 3 0 016 0V9" />,
  unlock: <path d="M5 9h10v8.5H5zM7 9V6.5a3 3 0 015.8-1" />,
  deformed: <path d="M3 16V4M17 16V4M3 4c4 3 10 3 14 0M3 4c5 1.5 9 1.5 14 0" />,
  moment: <path d="M2.5 10h15M2.5 10c2-5 13-5 15 0" />,
  shear: <path d="M2.5 10h15M2.5 10V6h7.5v8H17.5v-4" />,
  axial: <path d="M2.5 10h15M5 6.5h10v7H5z" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M15.5 12.5A6.5 6.5 0 017.5 4.5a6.5 6.5 0 108 8z" />,
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.3 12.3L17 17" />
    </>
  ),
  chevronRight: <path d="M7.5 5l5 5-5 5" />,
  chevronDown: <path d="M5 7.5l5 5 5-5" />,
  up: <path d="M5 12.5l5-5 5 5" />,
  down: <path d="M5 7.5l5 5 5-5" />,
  zoomExtents: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7z" />,
  layout1: <path d="M3 3.5h14v13H3z" />,
  layout2: <path d="M3 3.5h14v13H3zM10 3.5v13" />,
  layout4: <path d="M3 3.5h14v13H3zM10 3.5v13M3 10h14" />,
  check: <path d="M4 10.5l4 4 8-9" />,
  error: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
    </>
  ),
  warning: <path d="M10 3l7.5 13.5h-15zM10 8v4M10 14v.5" />,
  info: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5M10 6.5V7" />
    </>
  ),
  folder: <path d="M2.5 5V15.5h15V6.5H9L7.5 5z" />,
  material: (
    <>
      <path d="M4 4h12v12H4z" />
      <path d="M4 9l5-5M4 14l10-10M8 16l8-8M13 16l3-3" strokeWidth="1.1" />
    </>
  ),
  section: <path d="M5 3.5h10v2.5h-3.5v8H15v2.5H5V14h3.5V6H5z" />,
  load: <path d="M3 15.5h14M5 4v8M10 4v8M15 4v8M3.5 10L5 12l1.5-2M8.5 10L10 12l1.5-2M13.5 10L15 12l1.5-2" />,
  combo: <path d="M4 6h5M6.5 3.5v5M11 14h5M4 14l5-0M13.5 4.5l-7 11" />,
  story: <path d="M3 16.5h14M3 11.5h14M3 6.5h14M5 4v14" />,
  grid: <path d="M6 2.5v15M14 2.5v15M2.5 6h15M2.5 14h15" />,
  table: <path d="M3 4h14v12H3zM3 8h14M3 12h14M8 4v12" />,
  terminal: <path d="M3 4h14v12H3zM6 8l2.5 2L6 12M10 12h4" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  plus: <path d="M10 4v12M4 10h12" />,
  language: <path d="M3 5h8M7 3v2M4.5 5c1 3 3.5 5.5 6 6.5M9.5 5c-1 3-3.5 5.5-6 6.5M11 17l3-7 3 7M12 15h4" />,
  keyboard: <path d="M2.5 5.5h15v9h-15zM5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6 11.5h8" />,
};

export type IconName = keyof typeof paths;

export interface IconProps {
  name: IconName | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 18, className, style, title }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name] ?? paths.info}
    </svg>
  );
}

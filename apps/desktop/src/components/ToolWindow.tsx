import { Icon } from "@nexfem/ui";
import { useRef, useState, type ReactNode } from "react";

/**
 * Cửa sổ công cụ nổi, KHÔNG chặn khung nhìn (không có lớp phủ): vẫn chọn đối tượng, xoay, phóng to khi đang mở.
 * Kéo được bằng thanh tiêu đề. Dùng cho các hộp thoại Assign (chọn đối tượng trước hoặc sau đều được).
 */
export function ToolWindow({
  title,
  onClose,
  children,
  footer,
  width = 360,
  testId,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  testId?: string;
}) {
  const [pos, setPos] = useState(() => ({ left: Math.max(60, window.innerWidth - width - 300), top: 110 }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div
      className="tool-window"
      role="dialog"
      aria-label={title}
      data-testid={testId}
      style={{ left: pos.left, top: pos.top, width }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header
        className="tool-window-header"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            left: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 80),
            top: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 40),
          });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="tool-window-body">{children}</div>
      {footer && <footer className="tool-window-footer">{footer}</footer>}
    </div>
  );
}

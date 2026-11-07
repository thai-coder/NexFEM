import { Icon } from "@nexfem/ui";
import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  /** Độ rộng (px). */
  width?: number;
  testId?: string;
}

/** Khung hộp thoại: tiêu đề, nội dung cuộn được, chân hộp thoại; Esc để đóng. */
export function Modal({ title, onClose, children, footer, width = 760, testId }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, button:not(.modal-close)");
    first?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn modal-close" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

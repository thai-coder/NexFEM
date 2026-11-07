import { Icon } from "@nexfem/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { command, runCommand, type CommandId } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";

/** Menu chuột phải: đóng khi bấm ra ngoài, nhấn Esc, cuộn, đổi cỡ cửa sổ hoặc chọn một mục. */
export function ContextMenu() {
  const T = useT();
  const menu = useUi((s) => s.contextMenu);
  const set = useUi((s) => s.set);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = () => set({ contextMenu: null });
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu, set]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="menu-dropdown context-menu"
      role="menu"
      data-testid="context-menu"
      style={{ position: "fixed", left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.entries.map((e, i) => {
        if (e === "-") return <div key={i} className="menu-sep" role="separator" />;
        if (typeof e === "object") {
          if (e.header) return <div key={i} className="menu-header">{e.label}</div>;
          return (
            <button key={i} className="menu-item" role="menuitem" disabled={e.disabled} onClick={() => (set({ contextMenu: null }), e.run?.())}>
              <span className="menu-check">{e.icon ? <Icon name={e.icon} size={14} /> : null}</span>
              <span className="menu-label">{e.label}</span>
              <span />
              <span />
            </button>
          );
        }
        const c = command(e as CommandId);
        const disabled = c.enabled ? !c.enabled() : false;
        return (
          <button key={i} className="menu-item" role="menuitem" disabled={disabled} onClick={() => (set({ contextMenu: null }), runCommand(e as CommandId))}>
            <span className="menu-check">{c.icon ? <Icon name={c.icon} size={14} /> : null}</span>
            <span className="menu-label">{T.cmd[e as CommandId]}</span>
            {c.phase ? <span className="phase-badge">{T.fmt(T.phase.badge, { n: c.phase })}</span> : <span />}
            <span className="menu-shortcut">{c.shortcut ?? ""}</span>
          </button>
        );
      })}
    </div>
  );
}

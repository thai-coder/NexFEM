import { Icon } from "@nexfem/ui";
import { useEffect, useRef, useState } from "react";
import { MENUS, command, runCommand, type CommandId } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";
import { basename } from "../services/files.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

export function MenuBar() {
  const T = useT();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Đăng ký để menu cập nhật trạng thái bật/tắt khi mô hình hoặc giao diện đổi.
  useModel();
  const theme = useUi((s) => s.theme);
  const lang = useUi((s) => s.lang);
  const name = useModel((s) => s.model.name);
  const fileName = useModel((s) => s.fileName);
  const dirty = useModel((s) => s.dirty);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choose = (id: CommandId) => {
    setOpen(null);
    runCommand(id);
  };

  return (
    <div className="menubar" ref={ref} role="menubar">
      <div className="brand" aria-label="NexFEM">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 17V3l14 14V3" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>NexFEM</span>
      </div>
      {MENUS.map((m) => (
        <div key={m.id} className="menu">
          <button
            className={`menu-title${open === m.id ? " open" : ""}`}
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === m.id}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
          >
            {T.menu[m.id]}
          </button>
          {open === m.id && (
            <div className="menu-dropdown" role="menu">
              {m.items.map((item, i) =>
                item === "-" ? (
                  <div key={i} className="menu-sep" role="separator" />
                ) : (
                  <MenuEntry key={item} id={item} onChoose={choose} />
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <div className="menubar-spacer" />
      <div className="project-name" title={fileName ?? undefined}>
        {fileName ? basename(fileName) : `${name}.nxf`}
        {dirty && <span className="dirty-dot" aria-label="*" />}
      </div>
      <button className="icon-btn" title={`${T.cmd["tools.palette"]} (Ctrl+Shift+P)`} onClick={() => runCommand("tools.palette")}>
        <Icon name="search" size={16} />
      </button>
      <button className="icon-btn" title={T.cmd["tools.theme"]} onClick={() => runCommand("tools.theme")} data-testid="theme-toggle">
        <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
      </button>
      <button className="icon-btn lang-btn" title={T.cmd["tools.language"]} onClick={() => runCommand("tools.language")}>
        {lang === "vi" ? "VI" : "EN"}
      </button>
    </div>
  );
}

function MenuEntry({ id, onChoose }: { id: CommandId; onChoose(id: CommandId): void }) {
  const T = useT();
  const c = command(id);
  const disabled = c.enabled ? !c.enabled() : false;
  const checked = c.checked?.();
  return (
    <button className="menu-item" role="menuitem" disabled={disabled} onClick={() => onChoose(id)}>
      <span className="menu-check">{checked ? <Icon name="check" size={14} /> : c.icon ? <Icon name={c.icon} size={14} /> : null}</span>
      <span className="menu-label">{T.cmd[id]}</span>
      {c.phase ? <span className="phase-badge">{T.fmt(T.phase.badge, { n: c.phase })}</span> : null}
      <span className="menu-shortcut">{c.shortcut ?? ""}</span>
    </button>
  );
}

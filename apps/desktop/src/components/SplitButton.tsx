import { Icon } from "@nexfem/ui";
import { useEffect, useRef, useState } from "react";
import { command, runCommand, type CommandId } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";

/**
 * Nút gom nhóm lệnh cùng họ, kiểu thanh công cụ ETABS/SAP2000.
 * - mode "split": nút chính chạy lệnh dùng gần nhất (hoặc lệnh đang bật), mũi tên ▾ mở danh sách;
 * - mode "menu": cả nút mở danh sách (dùng cho nhóm Define, Assign).
 */
export function SplitButton({
  items,
  mode = "split",
  label,
  title,
  icon,
  placement = "below",
  testId,
}: {
  items: CommandId[];
  mode?: "split" | "menu";
  label?: string;
  title?: string;
  icon?: string;
  placement?: "below" | "right";
  testId?: string;
}) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<CommandId>(items[0]!);
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", () => setOpen(false));
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const toggle = () => {
    if (!open && root.current) {
      const r = root.current.getBoundingClientRect();
      setPos(placement === "right" ? { left: r.right + 2, top: r.top } : { left: r.left, top: r.bottom + 2 });
    }
    setOpen(!open);
  };

  const active = items.find((id) => command(id).checked?.());
  const main = command(active ?? last);
  const mainId = active ?? last;
  const label0 = T.cmd[mainId].replace(/…$/, "");
  const disabledMain = main.enabled ? !main.enabled() : false;

  return (
    <div className={`split ${placement}`} ref={root} data-testid={testId}>
      {mode === "split" ? (
        <>
          <button
            className={`tb-btn${active ? " checked" : ""}`}
            disabled={disabledMain}
            title={`${label0}${main.shortcut ? ` (${main.shortcut})` : ""}`}
            aria-pressed={active ? true : undefined}
            onClick={() => runCommand(mainId)}
          >
            <Icon name={main.icon ?? "info"} size={18} />
          </button>
          <button className="tb-arrow" aria-label={title ?? label0} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            <Icon name={placement === "right" ? "chevronRight" : "chevronDown"} size={9} />
          </button>
        </>
      ) : (
        <button className="tb-btn text" title={title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          {icon && <Icon name={icon} size={16} />}
          <span>{label}</span>
          <Icon name="chevronDown" size={9} />
        </button>
      )}
      {open && (
        <div className="menu-dropdown split-menu" role="menu" style={{ position: "fixed", left: pos.left, top: pos.top }}>
          {items.map((id) => {
            const c = command(id);
            const disabled = c.enabled ? !c.enabled() : false;
            return (
              <button
                key={id}
                className="menu-item"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  setLast(id);
                  runCommand(id);
                }}
              >
                <span className="menu-check">{c.checked?.() ? <Icon name="check" size={14} /> : c.icon ? <Icon name={c.icon} size={14} /> : null}</span>
                <span className="menu-label">{T.cmd[id]}</span>
                {c.phase ? <span className="phase-badge">{T.fmt(T.phase.badge, { n: c.phase })}</span> : <span />}
                <span className="menu-shortcut">{c.shortcut ?? ""}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { Icon } from "@nexfem/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { COMMANDS, runCommand } from "../commands/app.ts";
import { useT } from "../i18n/index.ts";
import { useUi } from "../stores/ui.ts";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
}

export function CommandPalette() {
  const T = useT();
  const open = useUi((s) => s.paletteOpen);
  const set = useUi((s) => s.set);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const nq = normalize(q.trim());
    return COMMANDS.filter((c) => !nq || normalize(`${T.cmd[c.id]} ${c.id}`).includes(nq)).slice(0, 50);
  }, [q, T]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;
  const close = () => set({ paletteOpen: false });
  const choose = (i: number) => {
    const c = items[i];
    if (!c) return;
    close();
    runCommand(c.id);
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label={T.cmd["tools.palette"]} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={input}
            value={q}
            placeholder={T.palette.placeholder}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setIdx((i) => Math.min(items.length - 1, i + 1));
              else if (e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
              else if (e.key === "Enter") choose(idx);
              else if (e.key === "Escape") close();
              else return;
              e.preventDefault();
            }}
          />
        </div>
        <div className="palette-list" role="listbox">
          {items.length === 0 && <div className="empty">{T.palette.empty}</div>}
          {items.map((c, i) => {
            const disabled = c.enabled ? !c.enabled() : false;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={i === idx}
                className={`palette-item${i === idx ? " active" : ""}`}
                disabled={disabled}
                onMouseEnter={() => setIdx(i)}
                onClick={() => choose(i)}
              >
                <Icon name={c.icon ?? "chevronRight"} size={15} />
                <span className="menu-label">{T.cmd[c.id]}</span>
                {c.phase ? <span className="phase-badge">{T.fmt(T.phase.badge, { n: c.phase })}</span> : null}
                <span className="menu-shortcut">{c.shortcut ?? ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

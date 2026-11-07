import { Icon } from "@nexfem/ui";
import { command, runCommand } from "../commands/app.ts";
import { SplitButton } from "../components/SplitButton.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

/** Thanh công cụ dọc bên trái: chọn và các công cụ vẽ; dầm/cột/giằng và sàn/vách gom thành nút xổ ra. */
export function ToolStrip() {
  const T = useT();
  useModel();
  useUi();
  const hidden = useUi((s) => s.toolbarHidden);
  if (hidden) return null;
  const single = (id: "draw.select" | "draw.joint") => {
    const c = command(id);
    const checked = c.checked?.() ?? false;
    const disabled = c.enabled ? !c.enabled() : false;
    return (
      <button
        className={`tb-btn${checked ? " checked" : ""}`}
        disabled={disabled}
        aria-pressed={checked}
        title={`${T.cmd[id]}${c.shortcut ? ` (${c.shortcut})` : ""}`}
        data-command={id}
        onClick={() => runCommand(id)}
      >
        <Icon name={c.icon ?? "info"} size={18} />
      </button>
    );
  };
  return (
    <div className="toolstrip" role="toolbar" aria-orientation="vertical" aria-label={T.menu.draw} data-testid="toolstrip">
      {single("draw.select")}
      {single("draw.joint")}
      <div className="tb-sep" />
      <SplitButton items={["draw.beam", "draw.column", "draw.brace"]} placement="right" title={T.explorer.frames} testId="strip-frames" />
      <SplitButton items={["draw.slab", "draw.wall"]} placement="right" title={T.explorer.shells} testId="strip-shells" />
    </div>
  );
}

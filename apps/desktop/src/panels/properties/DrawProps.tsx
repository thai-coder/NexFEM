import type { SnapModes } from "@nexfem/viewer";
import { useT } from "../../i18n/index.ts";
import { drawSection } from "../../tools/draw.ts";
import { useModel } from "../../stores/model.ts";
import { useUi, type StoryScope, type Tool } from "../../stores/ui.ts";

/** Panel Properties khi đang dùng công cụ vẽ: tiết diện sẽ gán, phạm vi tầng, bắt điểm. */
export function DrawProps({ tool }: { tool: Exclude<Tool, "select"> }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const scope = useUi((s) => s.storyScope);
  const set = useUi((s) => s.set);
  useUi((s) => s.drawSections);
  const shell = tool === "slab" || tool === "wall";
  const options = shell ? model.shellSections.filter((s) => s.kind === tool) : model.frameSections;
  const current = drawSection(model, tool);
  return (
    <div data-testid="draw-props">
      <div className="prop-head">
        <span className={`kind-dot ${tool}`} />
        {T.draw.title}: {T.cmd[`draw.${tool}`]}
      </div>
      <div className="prop-grid">
        {tool !== "joint" && (
          <>
            <div className="prop-label">{T.draw.section}</div>
            <div className="prop-value">
              {options.length ? (
                <select
                  value={current ?? ""}
                  aria-label={T.draw.section}
                  data-testid="draw-section"
                  onChange={(e) => set({ drawSections: { ...useUi.getState().drawSections, [tool]: e.target.value } })}
                >
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="warn-text">{T.draw.noSection}</span>
              )}
            </div>
          </>
        )}
        <div className="prop-label">{T.draw.scope}</div>
        <div className="prop-value">
          <select value={scope} aria-label={T.draw.scope} onChange={(e) => set({ storyScope: e.target.value as StoryScope })}>
            <option value="one">{T.story.one}</option>
            <option value="similar">{T.story.similar}</option>
            <option value="all">{T.story.all}</option>
          </select>
        </div>
      </div>
      <p className="muted pad small">
        {T.draw.hint[tool]} {T.draw.shift}
      </p>
      <SnapToggles vertical />
    </div>
  );
}

/** Các nút bật/tắt chế độ bắt điểm (dùng ở panel và thanh trạng thái). */
export function SnapToggles({ vertical }: { vertical?: boolean }) {
  const T = useT();
  const modes = useUi((s) => s.snapModes);
  const set = useUi((s) => s.set);
  const keys = Object.keys(T.draw.snapKinds) as (keyof SnapModes)[];
  return (
    <div className={`snap-toggles${vertical ? " vertical" : ""}`} role="group" aria-label={T.draw.snap}>
      {vertical && <div className="prop-label">{T.draw.snap}</div>}
      {keys.map((k) => (
        <label key={k} className="snap-toggle">
          <input type="checkbox" checked={modes[k]} onChange={(e) => set({ snapModes: { ...modes, [k]: e.target.checked } })} />
          {T.draw.snapKinds[k]}
        </label>
      ))}
    </div>
  );
}

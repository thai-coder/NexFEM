import { RELEASE_LABELS, RELEASE_PRESETS, type FrameLoad, type Restraint } from "@nexfem/model-core";
import { useState, type ReactNode } from "react";
import { Field, NumberField } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { useUi } from "../stores/ui.ts";

type What = "joints" | "frames" | "shells";

/** Id các đối tượng đang chọn thuộc loại `what`. */
function useSelected(what: What): string[] {
  const model = useModel((s) => s.model);
  const sel = new Set(useModel((s) => s.selection));
  return (model[what] as { id: string }[]).filter((o) => sel.has(o.id)).map((o) => o.id);
}

/** Khung chung cho hộp thoại Assign: đếm đối tượng chọn, lỗi, Áp dụng / OK. */
function AssignShell({
  title,
  what,
  ids,
  onClose,
  build,
  children,
  testId,
}: {
  title: string;
  what: What;
  ids: string[];
  onClose(): void;
  /** Trả về [tên lệnh, tham số] hoặc null nếu form chưa hợp lệ. */
  build(): [string, unknown] | null;
  children: ReactNode;
  testId: string;
}) {
  const T = useT();
  const A = T.assign;
  const locked = useModel((s) => s.locked);
  const [error, setError] = useState<string | null>(null);
  const op = build();
  const apply = (close: boolean) => {
    if (!op) return;
    const r = useModel.getState().run(op[0], op[1], title);
    if (!r.ok) return setError(r.error);
    setError(null);
    if (close) onClose();
  };
  const disabled = !ids.length || !op || locked;
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={520}
      testId={testId}
      footer={
        <>
          <div className={`modal-error${error || !ids.length ? " is-error" : ""}`} role="alert">
            {error ?? (ids.length ? T.fmt(A.selected, { n: ids.length, what: A[what] }) : T.fmt(A.noneSelected, { what: A[what] }))}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn" disabled={disabled} onClick={() => apply(false)}>
            {T.dlg.apply}
          </button>
          <button className="btn primary" disabled={disabled} onClick={() => apply(true)} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      <fieldset className="plain-fieldset" disabled={locked}>
        {children}
      </fieldset>
    </Modal>
  );
}

const DOF = ["Ux", "Uy", "Uz", "Rx", "Ry", "Rz"];
const RESTRAINT_PRESETS: Record<string, Restraint> = {
  fixed: [true, true, true, true, true, true],
  pinned: [true, true, true, false, false, false],
  roller: [false, false, true, false, false, false],
  free: [false, false, false, false, false, false],
};

function Checks({ labels, value, onChange, prefix }: { labels: readonly string[]; value: boolean[]; onChange(v: boolean[]): void; prefix: string }) {
  return (
    <div className="dof-row">
      {labels.map((d, i) => (
        <label key={d} className="dof">
          <input
            type="checkbox"
            checked={value[i]}
            data-testid={`${prefix}-${d}`}
            onChange={(e) => onChange(value.map((x, k) => (k === i ? e.target.checked : x)))}
          />
          {d}
        </label>
      ))}
    </div>
  );
}

export function AssignRestraintDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const ids = useSelected("joints");
  const [r, setR] = useState<boolean[]>(RESTRAINT_PRESETS.fixed!);
  return (
    <AssignShell title={T.assign.restraintTitle} what="joints" ids={ids} onClose={onClose} testId="dlg-assignRestraint" build={() => ["joint.assignRestraint", { joints: ids, restraint: r }]}>
      <Field label={T.props.restraint}>
        <Checks labels={DOF} value={r} onChange={setR} prefix="dof" />
      </Field>
      <Field label={T.assign.preset}>
        <div className="preset-row">
          {(["fixed", "pinned", "roller", "free"] as const).map((p) => (
            <button key={p} className="btn small" onClick={() => setR(RESTRAINT_PRESETS[p]!)}>
              {T.props[p]}
            </button>
          ))}
        </div>
      </Field>
    </AssignShell>
  );
}

export function AssignSectionDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const ids = useSelected("frames");
  const sections = useModel((s) => s.model.frameSections);
  const [section, setSection] = useState(sections[0]?.id ?? "");
  return (
    <AssignShell title={T.assign.sectionTitle} what="frames" ids={ids} onClose={onClose} testId="dlg-assignSection" build={() => (section ? ["frame.assignSection", { frames: ids, section }] : null)}>
      <Field label={T.props.section}>
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label={T.props.section}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
    </AssignShell>
  );
}

const NONE6 = [false, false, false, false, false, false];

export function AssignReleasesDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const A = T.assign;
  const ids = useSelected("frames");
  const [ri, setRi] = useState<boolean[]>([...RELEASE_PRESETS.pinnedBoth.i]);
  const [rj, setRj] = useState<boolean[]>([...RELEASE_PRESETS.pinnedBoth.j]);
  const preset = (k: keyof typeof RELEASE_PRESETS) => {
    const p = RELEASE_PRESETS[k];
    setRi(p ? [...p.i] : [...NONE6]);
    setRj(p ? [...p.j] : [...NONE6]);
  };
  const none = [...ri, ...rj].every((x) => !x);
  return (
    <AssignShell
      title={A.releasesTitle}
      what="frames"
      ids={ids}
      onClose={onClose}
      testId="dlg-assignReleases"
      build={() => ["frame.assignReleases", { frames: ids, releases: none ? null : { i: ri, j: rj } }]}
    >
      <Field label={A.preset}>
        <div className="preset-row">
          {(Object.keys(RELEASE_PRESETS) as (keyof typeof RELEASE_PRESETS)[]).map((k) => (
            <button key={k} className="btn small" onClick={() => preset(k)}>
              {A.presets[k]}
            </button>
          ))}
        </div>
      </Field>
      <Field label={A.start}>
        <Checks labels={RELEASE_LABELS} value={ri} onChange={setRi} prefix="rel-i" />
      </Field>
      <Field label={A.end}>
        <Checks labels={RELEASE_LABELS} value={rj} onChange={setRj} prefix="rel-j" />
      </Field>
    </AssignShell>
  );
}

function PatternSelect({ value, onChange }: { value: string; onChange(v: string): void }) {
  const T = useT();
  const patterns = useModel((s) => s.model.loadPatterns);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={T.assign.pattern} data-testid="load-pattern">
      {patterns.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

type Mode = "replace" | "add" | "delete";

function ModeSelect({ value, onChange }: { value: Mode; onChange(v: Mode): void }) {
  const T = useT();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Mode)} aria-label={T.assign.mode}>
      {(["replace", "add", "delete"] as const).map((m) => (
        <option key={m} value={m}>
          {T.assign.modes[m]}
        </option>
      ))}
    </select>
  );
}

/** Sau khi gán tải thì hiện mẫu tải đó trên khung nhìn. */
const showPattern = (p: string) => useUi.getState().set({ loadDisplay: p });

export function AssignFrameLoadDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const A = T.assign;
  const ids = useSelected("frames");
  const model = useModel((s) => s.model);
  const [pattern, setPattern] = useState(model.loadPatterns.find((p) => p.type === "superDead")?.id ?? model.loadPatterns[0]?.id ?? "");
  const [kind, setKind] = useState<FrameLoad["kind"]>("distributed");
  const [direction, setDirection] = useState<FrameLoad["direction"]>("gravity");
  const [value, setValue] = useState(10);
  const [at, setAt] = useState(0.5);
  const [mode, setMode] = useState<Mode>("replace");
  return (
    <AssignShell
      title={A.frameLoadTitle}
      what="frames"
      ids={ids}
      onClose={() => {
        if (pattern) showPattern(pattern);
        onClose();
      }}
      testId="dlg-assignFrameLoad"
      build={() => (pattern ? ["frame.assignLoad", { frames: ids, pattern, kind, direction, value, mode, ...(kind === "point" ? { at } : {}) }] : null)}
    >
      <Field label={A.pattern}>
        <PatternSelect value={pattern} onChange={setPattern} />
      </Field>
      <Field label={A.type}>
        <select value={kind} onChange={(e) => setKind(e.target.value as FrameLoad["kind"])} aria-label={A.type}>
          <option value="distributed">{A.distributed}</option>
          <option value="point">{A.point}</option>
        </select>
      </Field>
      <Field label={A.direction}>
        <select value={direction} onChange={(e) => setDirection(e.target.value as FrameLoad["direction"])} aria-label={A.direction}>
          {(Object.keys(A.directions) as FrameLoad["direction"][]).map((d) => (
            <option key={d} value={d}>
              {A.directions[d]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={A.value}>
        <NumberField value={value} onChange={setValue} quantity={kind === "point" ? "force" : "forcePerLength"} units={model.units} label={A.value} testId="load-value" />
      </Field>
      {kind === "point" && (
        <Field label={A.at}>
          <NumberField value={at} onChange={(v) => setAt(Math.min(1, Math.max(0, v)))} min={0} label={A.at} />
        </Field>
      )}
      <Field label={A.mode}>
        <ModeSelect value={mode} onChange={setMode} />
      </Field>
    </AssignShell>
  );
}

export function AssignShellLoadDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const A = T.assign;
  const ids = useSelected("shells");
  const model = useModel((s) => s.model);
  const [pattern, setPattern] = useState(model.loadPatterns.find((p) => p.type === "live")?.id ?? model.loadPatterns[0]?.id ?? "");
  const [direction, setDirection] = useState<"gravity" | "globalZ" | "local3">("gravity");
  const [value, setValue] = useState(2);
  const [mode, setMode] = useState<Mode>("replace");
  return (
    <AssignShell
      title={A.shellLoadTitle}
      what="shells"
      ids={ids}
      onClose={() => {
        if (pattern) showPattern(pattern);
        onClose();
      }}
      testId="dlg-assignShellLoad"
      build={() => (pattern ? ["shell.assignLoad", { shells: ids, pattern, direction, value, mode }] : null)}
    >
      <Field label={A.pattern}>
        <PatternSelect value={pattern} onChange={setPattern} />
      </Field>
      <Field label={A.direction}>
        <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label={A.direction}>
          {(["gravity", "globalZ", "local3"] as const).map((d) => (
            <option key={d} value={d}>
              {A.directions[d]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={A.value}>
        <NumberField value={value} onChange={setValue} quantity="stress" units={model.units} label={A.value} testId="load-value" />
      </Field>
      <Field label={A.mode}>
        <ModeSelect value={mode} onChange={setMode} />
      </Field>
    </AssignShell>
  );
}

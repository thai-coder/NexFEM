import {
  findObject,
  frameLength,
  jointMap,
  modelSummary,
  sectionProperties,
  toDisplay,
  unitLabel,
  unitsLabel,
  type Frame,
  type FrameSection,
  type Joint,
  type Material,
  type Model,
  type Quantity,
  type Restraint,
  type Shell,
} from "@nexfem/model-core";
import { useEffect, useState, type ReactNode } from "react";
import { NumberField } from "../../components/fields.tsx";
import { runCommand } from "../../commands/app.ts";
import { useT } from "../../i18n/index.ts";
import { useModel } from "../../stores/model.ts";
import { useUi } from "../../stores/ui.ts";
import { DrawProps } from "./DrawProps.tsx";

export function Properties() {
  const T = useT();
  const model = useModel((s) => s.model);
  const selection = useModel((s) => s.selection);
  const locked = useModel((s) => s.locked);
  const tool = useUi((s) => s.tool);

  let body: ReactNode;
  if (tool !== "select") body = <DrawProps tool={tool} />;
  else if (selection.length === 0) body = <Summary model={model} />;
  else if (selection.length === 1) {
    const hit = findObject(model, selection[0]!);
    const obj = hit?.object;
    switch (hit?.collection) {
      case "frames":
        body = <FrameProps key={obj!.id} frame={obj as Frame} model={model} locked={locked} />;
        break;
      case "joints":
        body = <JointProps key={obj!.id} joint={obj as Joint} model={model} locked={locked} />;
        break;
      case "shells":
        body = <ShellProps shell={obj as Shell} model={model} />;
        break;
      case "frameSections":
        body = <SectionProps section={obj as FrameSection} model={model} />;
        break;
      case "materials":
        body = <MaterialProps material={obj as Material} model={model} />;
        break;
      default:
        body = obj ? <Generic obj={obj as unknown as Record<string, unknown>} /> : <p className="muted pad">{T.props.nothing}</p>;
    }
  } else body = <MultiProps ids={selection} model={model} locked={locked} />;

  return (
    <div className="properties" data-testid="properties">
      {locked && (
        <div className="locked-banner">
          {T.props.locked}
          <button className="btn small" onClick={() => runCommand("analyze.unlock")}>
            {T.props.unlockToEdit}
          </button>
        </div>
      )}
      {body}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="prop-section">
      <button className="prop-section-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`twisty${open ? " open" : ""}`}>▸</span>
        {title}
      </button>
      {open && <div className="prop-grid">{children}</div>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="prop-label">{label}</div>
      <div className="prop-value">{children}</div>
    </>
  );
}

function useNum(model: Model) {
  return (v: number, q: Quantity, digits = 3) => (
    <span className="num">
      {toDisplay(v, q, model.units).toFixed(digits)} <span className="unit">{unitLabel(q, model.units)}</span>
    </span>
  );
}

function sci(model: Model) {
  return (v: number, q: Quantity) => (
    <span className="num">
      {toDisplay(v, q, model.units).toExponential(3)} <span className="unit">{unitLabel(q, model.units)}</span>
    </span>
  );
}

function Summary({ model }: { model: Model }) {
  const T = useT();
  const s = modelSummary(model);
  return (
    <>
      <p className="muted pad">{T.props.nothing}</p>
      <Section title={T.props.summary}>
        <Row label={T.explorer.project}>{model.name}</Row>
        <Row label={T.props.units}>{unitsLabel(model.units)}</Row>
        <Row label={T.explorer.stories}>{s.stories}</Row>
        <Row label={T.explorer.joints}>{s.joints}</Row>
        <Row label={T.props.column}>{s.columns}</Row>
        <Row label={T.props.beam}>{s.beams}</Row>
        <Row label={T.props.brace}>{s.braces}</Row>
        <Row label={T.explorer.shells}>{s.shells}</Row>
        <Row label={T.explorer.loadPatterns}>{s.loadPatterns}</Row>
        <Row label={T.explorer.combos}>{s.combos}</Row>
      </Section>
      <Section title={T.props.designCodes}>
        {Object.entries(model.designCodes).map(([k, v]) => (
          <Row key={k} label={k}>
            {v}
          </Row>
        ))}
      </Section>
    </>
  );
}

function ApplyBar({ dirty, onApply, onRevert, locked }: { dirty: boolean; onApply(): void; onRevert(): void; locked: boolean }) {
  const T = useT();
  return (
    <div className="apply-bar">
      <button className="btn" disabled={!dirty} onClick={onRevert}>
        {T.props.revert}
      </button>
      <button className="btn primary" disabled={!dirty || locked} onClick={onApply} data-testid="apply">
        {T.props.apply}
      </button>
    </div>
  );
}

function FrameProps({ frame, model, locked }: { frame: Frame; model: Model; locked: boolean }) {
  const T = useT();
  const num = useNum(model);
  const execute = useModel((s) => s.execute);
  const [label, setLabel] = useState(frame.label);
  const [section, setSection] = useState(frame.section);
  useEffect(() => {
    setLabel(frame.label);
    setSection(frame.section);
  }, [frame.label, frame.section]);
  const joints = jointMap(model);
  const a = joints.get(frame.i);
  const b = joints.get(frame.j);
  const sec = model.frameSections.find((s) => s.id === section);
  const mat = model.materials.find((m) => m.id === sec?.material);
  const story = model.stories.find((s) => s.id === frame.story);
  const loads = model.frameLoads.filter((l) => l.frame === frame.id).length;
  const dirty = label !== frame.label || section !== frame.section;
  const coord = (j: Joint | undefined) => (j ? `(${[j.x, j.y, j.z].map((v) => toDisplay(v, "length", model.units).toFixed(3)).join(", ")})` : "?");

  return (
    <>
      <div className="prop-head">
        <span className={`kind-dot ${frame.kind}`} />
        {T.props[frame.kind]} {frame.label}
      </div>
      <Section title={T.props.general}>
        <Row label={T.props.label}>
          <input value={label} disabled={locked} onChange={(e) => setLabel(e.target.value)} aria-label={T.props.label} />
        </Row>
        <Row label={T.props.kind}>{T.props[frame.kind]}</Row>
        <Row label={T.props.story}>{story?.name ?? "—"}</Row>
        <Row label={T.props.section}>
          <select value={section} disabled={locked} onChange={(e) => setSection(e.target.value)} aria-label={T.props.section} data-testid="section-select">
            {model.frameSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={T.props.material}>{mat?.name ?? "—"}</Row>
      </Section>
      <Section title={T.props.geometry}>
        <Row label={T.props.length}>{num(frameLength(frame, joints), "length")}</Row>
        <Row label={T.props.start}>
          <span className="num">{coord(a)}</span>
        </Row>
        <Row label={T.props.end}>
          <span className="num">{coord(b)}</span>
        </Row>
      </Section>
      <Section title={T.props.assigns}>
        <Row label={T.props.releases}>{frame.releases ? "✓" : T.props.none}</Row>
        <Row label={T.props.loads}>{loads ? T.fmt(T.props.loadCount, { n: loads }) : T.props.none}</Row>
      </Section>
      <Section title={T.props.results}>
        <div className="muted span2">{T.props.resultsLater}</div>
      </Section>
      <ApplyBar
        dirty={dirty}
        locked={locked}
        onRevert={() => {
          setLabel(frame.label);
          setSection(frame.section);
        }}
        onApply={() => {
          if (section !== frame.section) execute("frame.assignSection", { frames: [frame.id], section });
          if (label !== frame.label) execute("object.update", { collection: "frames", id: frame.id, patch: { label } });
        }}
      />
    </>
  );
}

const PRESETS: Record<string, Restraint> = {
  fixed: [true, true, true, true, true, true],
  pinned: [true, true, true, false, false, false],
  roller: [false, false, true, false, false, false],
  free: [false, false, false, false, false, false],
};
const DOF = ["Ux", "Uy", "Uz", "Rx", "Ry", "Rz"];

function RestraintEditor({ value, onChange, disabled }: { value: Restraint; onChange(r: Restraint): void; disabled: boolean }) {
  const T = useT();
  return (
    <div className="restraint-editor">
      <div className="dof-row">
        {DOF.map((d, i) => (
          <label key={d} className="dof">
            <input
              type="checkbox"
              checked={value[i]}
              disabled={disabled}
              onChange={(e) => {
                const r = [...value] as Restraint;
                r[i] = e.target.checked;
                onChange(r);
              }}
            />
            {d}
          </label>
        ))}
      </div>
      <div className="preset-row">
        {(["fixed", "pinned", "roller", "free"] as const).map((p) => (
          <button key={p} className="btn small" disabled={disabled} onClick={() => onChange(PRESETS[p]!)}>
            {T.props[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ô nhãn: Enter hoặc rời ô để lưu; báo lỗi (trùng, rỗng) ngay dưới ô. */
function LabelField({ collection, id, label }: { collection: "joints" | "frames" | "shells"; id: string; label: string }) {
  const T = useT();
  const locked = useModel((s) => s.locked);
  const [text, setText] = useState(label);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(label);
    setError(null);
  }, [label, id]);
  const commit = () => {
    if (text.trim() === label) return setError(null);
    const r = useModel.getState().run("object.update", { collection, id, patch: { label: text } }, T.rename.title);
    if (!r.ok) setError(r.error);
  };
  return (
    <div>
      <input
        value={text}
        disabled={locked}
        aria-label={T.props.label}
        aria-invalid={!!error}
        data-testid="label-input"
        onChange={(e) => (setText(e.target.value), setError(null))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") (setText(label), setError(null));
        }}
      />
      {error && (
        <div className="warn-text" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function JointProps({ joint, model, locked }: { joint: Joint; model: Model; locked: boolean }) {
  const T = useT();
  const execute = useModel((s) => s.execute);
  const initial: Restraint = joint.restraint ?? PRESETS.free!;
  const [r, setR] = useState<Restraint>(initial);
  const [pt, setPt] = useState<[number, number, number]>([joint.x, joint.y, joint.z]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setR(joint.restraint ?? PRESETS.free!);
  }, [joint.restraint]);
  useEffect(() => {
    setPt([joint.x, joint.y, joint.z]);
    setError(null);
  }, [joint.x, joint.y, joint.z, joint.id]);
  const moved = pt[0] !== joint.x || pt[1] !== joint.y || pt[2] !== joint.z;
  const dirty = moved || r.some((v, i) => v !== initial[i]);
  const setAxis = (k: 0 | 1 | 2, v: number) => setPt((p) => p.map((x, i) => (i === k ? v : x)) as [number, number, number]);
  return (
    <>
      <div className="prop-head">
        <span className="kind-dot joint" />
        {T.props.joint} {joint.label}
      </div>
      <Section title={T.props.general}>
        <Row label={T.props.label}>
          <LabelField collection="joints" id={joint.id} label={joint.label} />
        </Row>
        <Row label={T.props.story}>{model.stories.find((s) => s.id === joint.story)?.name ?? "—"}</Row>
      </Section>
      <Section title={T.props.coords}>
        {(["X", "Y", "Z"] as const).map((axis, k) => (
          <Row key={axis} label={axis}>
            <NumberField value={pt[k] ?? 0} onChange={(v) => setAxis(k as 0 | 1 | 2, v)} quantity="length" units={model.units} label={axis} testId={`joint-${axis.toLowerCase()}`} />
          </Row>
        ))}
      </Section>
      <Section title={T.props.restraint}>
        <div className="span2">
          <RestraintEditor value={r} onChange={setR} disabled={locked} />
        </div>
      </Section>
      {error && (
        <div className="warn-text pad" role="alert">
          {error}
        </div>
      )}
      <ApplyBar
        dirty={dirty}
        locked={locked}
        onRevert={() => (setR(initial), setPt([joint.x, joint.y, joint.z]), setError(null))}
        onApply={() => {
          if (moved) {
            const res = useModel.getState().run("joint.move", { joint: joint.id, point: pt }, T.props.coords);
            if (!res.ok) return setError(res.error);
          }
          if (r.some((v, i) => v !== initial[i])) execute("joint.assignRestraint", { joints: [joint.id], restraint: r });
          setError(null);
        }}
      />
    </>
  );
}

function polygonArea(model: Model, shell: Shell): number {
  const joints = jointMap(model);
  const pts = shell.joints.map((id) => joints.get(id)).filter((j) => j !== undefined);
  // Diện tích đa giác phẳng trong không gian: nửa độ lớn tổng tích có hướng.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k]!;
    const b = pts[(k + 1) % pts.length]!;
    nx += a.y * b.z - a.z * b.y;
    ny += a.z * b.x - a.x * b.z;
    nz += a.x * b.y - a.y * b.x;
  }
  return Math.hypot(nx, ny, nz) / 2;
}

function ShellProps({ shell, model }: { shell: Shell; model: Model }) {
  const T = useT();
  const num = useNum(model);
  const sec = model.shellSections.find((s) => s.id === shell.section);
  const loads = model.shellLoads.filter((l) => l.shell === shell.id);
  return (
    <>
      <div className="prop-head">
        <span className={`kind-dot ${shell.kind}`} />
        {T.props[shell.kind]} {shell.label}
      </div>
      <Section title={T.props.general}>
        <Row label={T.props.label}>
          <LabelField collection="shells" id={shell.id} label={shell.label} />
        </Row>
        <Row label={T.props.kind}>{T.props[shell.kind]}</Row>
        <Row label={T.props.story}>{model.stories.find((s) => s.id === shell.story)?.name ?? "—"}</Row>
        <Row label={T.props.section}>{sec?.name ?? "—"}</Row>
        <Row label={T.props.thickness}>{sec ? num(sec.thickness, "length") : "—"}</Row>
      </Section>
      <Section title={T.props.geometry}>
        <Row label={T.props.area}>{num(polygonArea(model, shell), "area")}</Row>
      </Section>
      <Section title={T.props.loads}>
        {loads.length === 0 && <div className="muted span2">{T.props.none}</div>}
        {loads.map((l) => (
          <Row key={l.id} label={model.loadPatterns.find((p) => p.id === l.pattern)?.name ?? l.pattern}>
            {num(l.value, "stress", 2)}
          </Row>
        ))}
      </Section>
    </>
  );
}

function SectionProps({ section, model }: { section: FrameSection; model: Model }) {
  const T = useT();
  const num = useNum(model);
  const s = sci(model);
  const p = sectionProperties(section.geometry);
  const g = section.geometry as Record<string, number | string>;
  return (
    <>
      <div className="prop-head">{section.name}</div>
      <Section title={T.props.general}>
        <Row label={T.props.material}>{model.materials.find((m) => m.id === section.material)?.name ?? "—"}</Row>
        <Row label={T.props.shape}>{String(g.shape)}</Row>
        {Object.entries(g)
          .filter(([k]) => k !== "shape")
          .map(([k, v]) => (
            <Row key={k} label={k}>
              {num(Number(v), "length")}
            </Row>
          ))}
      </Section>
      <Section title={T.props.geometry}>
        <Row label="A">{s(p.A, "area")}</Row>
        <Row label="I33">{s(p.I33, "inertia")}</Row>
        <Row label="I22">{s(p.I22, "inertia")}</Row>
        <Row label="J">{s(p.J, "inertia")}</Row>
      </Section>
    </>
  );
}

function MaterialProps({ material, model }: { material: Material; model: Model }) {
  const T = useT();
  const s = sci(model);
  return (
    <>
      <div className="prop-head">{material.name}</div>
      <Section title={T.props.general}>
        <Row label={T.props.kind}>{material.type}</Row>
        <Row label="E">{s(material.E, "stress")}</Row>
        <Row label="ν">{material.nu}</Row>
        <Row label="γ">
          <span className="num">{material.gamma} kN/m³</span>
        </Row>
        {material.strength !== undefined && <Row label={material.type === "concrete" ? "Rb" : "fy / Rs"}>{s(material.strength, "stress")}</Row>}
        {material.code && <Row label={T.props.designCodes}>{material.code}</Row>}
      </Section>
    </>
  );
}

function Generic({ obj }: { obj: Record<string, unknown> }) {
  const T = useT();
  return (
    <Section title={T.props.general}>
      {Object.entries(obj).map(([k, v]) => (
        <Row key={k} label={k}>
          <span className="num">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </Row>
      ))}
    </Section>
  );
}

function MultiProps({ ids, model, locked }: { ids: string[]; model: Model; locked: boolean }) {
  const T = useT();
  const execute = useModel((s) => s.execute);
  const set = new Set(ids);
  const frames = model.frames.filter((f) => set.has(f.id));
  const shells = model.shells.filter((s) => set.has(s.id));
  const joints = model.joints.filter((j) => set.has(j.id));
  const sections = new Set(frames.map((f) => f.section));
  const common = sections.size === 1 ? [...sections][0]! : "";
  const [section, setSection] = useState(common);
  useEffect(() => {
    setSection(common);
  }, [common]);
  const kinds = new Set(frames.map((f) => f.kind));
  return (
    <>
      <div className="prop-head">
        {ids.length} {T.props.selected}
      </div>
      <Section title={T.props.general}>
        <Row label={T.explorer.frames}>{frames.length}</Row>
        <Row label={T.explorer.shells}>{shells.length}</Row>
        <Row label={T.explorer.joints}>{joints.length}</Row>
        {frames.length > 0 && (
          <>
            <Row label={T.props.kind}>{kinds.size === 1 ? T.props[[...kinds][0]!] : T.props.varies}</Row>
            <Row label={T.props.section}>
              <select value={section} disabled={locked} onChange={(e) => setSection(e.target.value)} aria-label={T.props.section}>
                {!common && <option value="">{T.props.varies}</option>}
                {model.frameSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}
      </Section>
      {frames.length > 0 && (
        <ApplyBar
          dirty={!!section && section !== common}
          locked={locked}
          onRevert={() => setSection(common)}
          onApply={() => execute("frame.assignSection", { frames: frames.map((f) => f.id), section })}
        />
      )}
    </>
  );
}

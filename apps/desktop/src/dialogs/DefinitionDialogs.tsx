import {
  MATERIAL_LIBRARY,
  sectionExtent,
  sectionProperties,
  toDisplay,
  unitLabel,
  type FrameSection,
  type FrameShape,
  type LoadCase,
  type LoadCombo,
  type LoadPattern,
  type Material,
  type Model,
  type Quantity,
  type ShellSection,
} from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import type { DefinitionCollection } from "@nexfem/model-core";
import { DefineDialog, type DefineSection, type Drafts, type Item } from "../components/DefineDialog.tsx";
import { Field, NumberField, fmtNum } from "../components/fields.tsx";
import { useT, type T as Strings } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";

const MPa = 1000;

function NF(props: { value: number; onChange(v: number): void; q?: Quantity; min?: number; label: string; testId?: string }) {
  const units = useModel((s) => s.model.units);
  return (
    <NumberField
      value={props.value}
      onChange={props.onChange}
      {...(props.q ? { quantity: props.q, units } : {})}
      {...(props.min !== undefined ? { min: props.min } : {})}
      label={props.label}
      {...(props.testId ? { testId: props.testId } : {})}
    />
  );
}

// ------------------------------------------------------------------ materials

function materialSection(T: Strings): DefineSection<Material & Item> {
  return {
    collection: "materials",
    label: T.dlg.materials.title,
    icon: "material",
    idPrefix: "mat",
    namePrefix: "MAT",
    library: MATERIAL_LIBRARY as (Material & Item)[],
    create: (id, name) => ({ id, name, type: "concrete", E: 30000 * MPa, nu: 0.2, gamma: 25, strength: 14.5 * MPa }),
    form: (m, update) => (
      <>
        <Field label={T.dlg.materials.type}>
          <select value={m.type} onChange={(e) => update({ type: e.target.value as Material["type"] })}>
            {(["concrete", "steel", "rebar", "other"] as const).map((k) => (
              <option key={k} value={k}>
                {T.dlg.materials.types[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T.dlg.materials.E}>
          <NF value={m.E} onChange={(E) => update({ E })} q="stress" min={1e-9} label="E" testId="mat-E" />
        </Field>
        <Field label={T.dlg.materials.nu}>
          <NF value={m.nu} onChange={(nu) => update({ nu: Math.min(0.5, nu) })} min={0} label="nu" />
        </Field>
        <Field label={T.dlg.materials.gamma}>
          <NF value={m.gamma} onChange={(gamma) => update({ gamma })} q="unitWeight" min={0} label="gamma" />
        </Field>
        <Field label={T.dlg.materials.strength}>
          <NF value={m.strength ?? 0} onChange={(strength) => update({ strength })} q="stress" min={0} label="strength" />
        </Field>
        <Field label={T.dlg.materials.code}>
          <input value={m.code ?? ""} onChange={(e) => update({ code: e.target.value || undefined } as Partial<Material & Item>)} />
        </Field>
      </>
    ),
  };
}

export function MaterialsDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  return <DefineDialog title={T.dlg.materials.title} sections={[materialSection(T) as unknown as DefineSection]} onClose={onClose} testId="dlg-materials" footerNote={T.dlg.materials.note} />;
}

// ------------------------------------------------------------------ frame sections

const SHAPE_DEFAULTS: Record<FrameShape["shape"], FrameShape> = {
  rect: { shape: "rect", b: 0.3, h: 0.6 },
  circle: { shape: "circle", d: 0.5 },
  I: { shape: "I", h: 0.4, bf: 0.2, tf: 0.013, tw: 0.008 },
  box: { shape: "box", h: 0.3, b: 0.3, t: 0.012 },
  pipe: { shape: "pipe", d: 0.3, t: 0.01 },
};

const DIM_KEYS: Record<FrameShape["shape"], string[]> = {
  rect: ["b", "h"],
  circle: ["d"],
  I: ["h", "bf", "tf", "tw"],
  box: ["h", "b", "t"],
  pipe: ["d", "t"],
};

/** Hình tiết diện vẽ đúng tỉ lệ. */
export function SectionPreview({ g }: { g: FrameShape }) {
  const [w, h] = sectionExtent(g);
  const S = 150 / Math.max(w, h);
  const W = w * S;
  const H = h * S;
  const x0 = (170 - W) / 2;
  const y0 = (170 - H) / 2;
  let shape;
  switch (g.shape) {
    case "rect":
      shape = <rect x={x0} y={y0} width={W} height={H} />;
      break;
    case "circle":
      shape = <circle cx={85} cy={85} r={W / 2} />;
      break;
    case "pipe":
      shape = (
        <path
          fillRule="evenodd"
          d={`M${85 - W / 2},85a${W / 2},${W / 2} 0 1,0 ${W},0a${W / 2},${W / 2} 0 1,0 ${-W},0zM${85 - W / 2 + g.t * S},85a${W / 2 - g.t * S},${W / 2 - g.t * S} 0 1,0 ${W - 2 * g.t * S},0a${W / 2 - g.t * S},${W / 2 - g.t * S} 0 1,0 ${-(W - 2 * g.t * S)},0z`}
        />
      );
      break;
    case "box":
      shape = <path fillRule="evenodd" d={`M${x0},${y0}h${W}v${H}h${-W}zM${x0 + g.t * S},${y0 + g.t * S}v${H - 2 * g.t * S}h${W - 2 * g.t * S}v${-(H - 2 * g.t * S)}z`} />;
      break;
    case "I": {
      const tf = g.tf * S;
      const tw = g.tw * S;
      shape = (
        <path
          d={`M${x0},${y0}h${W}v${tf}h${-(W - tw) / 2}v${H - 2 * tf}h${(W - tw) / 2}v${tf}h${-W}v${-tf}h${(W - tw) / 2}v${-(H - 2 * tf)}h${-(W - tw) / 2}z`}
        />
      );
      break;
    }
  }
  return (
    <svg className="section-preview" viewBox="0 0 170 170" width="170" height="170" role="img" aria-label={g.shape}>
      <line x1="85" y1="4" x2="85" y2="166" className="axis" />
      <line x1="4" y1="85" x2="166" y2="85" className="axis" />
      <g className="shape">{shape}</g>
      <text x="160" y="80" className="axis-label">
        2
      </text>
      <text x="90" y="12" className="axis-label">
        3
      </text>
    </svg>
  );
}

function frameSectionSection(T: Strings, model: Model): DefineSection<FrameSection & Item> {
  return {
    collection: "frameSections",
    label: T.dlg.frameSections.title,
    icon: "section",
    idPrefix: "sec",
    namePrefix: "SEC",
    create: (id, name, drafts) => ({
      id,
      name,
      material: ((drafts.materials ?? model.materials) as Item[])[0]?.id ?? "",
      geometry: { ...SHAPE_DEFAULTS.rect },
    }),
    form: (s, update, { model: m }) => {
      const g = s.geometry;
      const p = sectionProperties(g);
      const u = m.units;
      const sci = (v: number, q: Quantity) => `${toDisplay(v, q, u).toExponential(3)} ${unitLabel(q, u)}`;
      const mats = m.materials;
      return (
        <div className="section-form">
          <div>
            <Field label={T.props.material}>
              <select value={s.material} onChange={(e) => update({ material: e.target.value })} data-testid="sec-material">
                {!mats.some((x) => x.id === s.material) && <option value={s.material}>?</option>}
                {mats.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={T.dlg.frameSections.shape}>
              <div className="shape-picker" role="radiogroup" aria-label={T.dlg.frameSections.shape}>
                {(Object.keys(SHAPE_DEFAULTS) as FrameShape["shape"][]).map((k) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={g.shape === k}
                    className={`btn small${g.shape === k ? " checked" : ""}`}
                    onClick={() => g.shape !== k && update({ geometry: { ...SHAPE_DEFAULTS[k] } })}
                  >
                    {T.dlg.frameSections.shapes[k]}
                  </button>
                ))}
              </div>
            </Field>
            {DIM_KEYS[g.shape].map((k) => (
              <Field key={`${g.shape}-${k}`} label={T.dlg.frameSections.dims[k as keyof Strings["dlg"]["frameSections"]["dims"]]}>
                <NF
                  value={(g as unknown as Record<string, number>)[k]!}
                  onChange={(v) => update({ geometry: { ...g, [k]: v } as FrameShape })}
                  q="length"
                  min={1e-6}
                  label={k}
                  testId={`dim-${k}`}
                />
              </Field>
            ))}
            <h4 className="form-subtitle">{T.dlg.frameSections.props}</h4>
            <dl className="props-list">
              <dt>A</dt>
              <dd data-testid="prop-A">{sci(p.A, "area")}</dd>
              <dt>I33</dt>
              <dd>{sci(p.I33, "inertia")}</dd>
              <dt>I22</dt>
              <dd>{sci(p.I22, "inertia")}</dd>
              <dt>J</dt>
              <dd>{sci(p.J, "inertia")}</dd>
            </dl>
          </div>
          <SectionPreview g={g} />
        </div>
      );
    },
  };
}

export function FrameSectionsDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const model = useModel((s) => s.model);
  return <DefineDialog title={T.dlg.frameSections.title} sections={[frameSectionSection(T, model) as unknown as DefineSection]} onClose={onClose} testId="dlg-frameSections" />;
}

// ------------------------------------------------------------------ shell sections

function shellSectionSection(T: Strings, model: Model): DefineSection<ShellSection & Item> {
  return {
    collection: "shellSections",
    label: T.dlg.shellSections.title,
    icon: "slab",
    idPrefix: "shs",
    namePrefix: "S",
    create: (id, name, drafts) => ({
      id,
      name,
      material: ((drafts.materials ?? model.materials) as Item[])[0]?.id ?? "",
      kind: "slab",
      formulation: "shell-thin",
      thickness: 0.12,
    }),
    form: (s, update, { model: m }) => (
      <>
        <Field label={T.props.material}>
          <select value={s.material} onChange={(e) => update({ material: e.target.value })}>
            {m.materials.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T.dlg.shellSections.kind}>
          <select value={s.kind} onChange={(e) => update({ kind: e.target.value as ShellSection["kind"] })}>
            <option value="slab">{T.props.slab}</option>
            <option value="wall">{T.props.wall}</option>
          </select>
        </Field>
        <Field label={T.dlg.shellSections.formulation}>
          <select value={s.formulation} onChange={(e) => update({ formulation: e.target.value as ShellSection["formulation"] })}>
            {(["shell-thin", "shell-thick", "membrane", "plate"] as const).map((k) => (
              <option key={k} value={k}>
                {T.dlg.shellSections.formulations[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T.dlg.shellSections.thickness}>
          <NF value={s.thickness} onChange={(thickness) => update({ thickness })} q="length" min={1e-6} label="thickness" />
        </Field>
      </>
    ),
  };
}

export function ShellSectionsDialog({ onClose }: { onClose(): void }) {
  const T = useT();
  const model = useModel((s) => s.model);
  return <DefineDialog title={T.dlg.shellSections.title} sections={[shellSectionSection(T, model) as unknown as DefineSection]} onClose={onClose} testId="dlg-shellSections" />;
}

// ------------------------------------------------------------------ loads

/** Bảng các dòng (mẫu tải/trường hợp + hệ số). */
function FactorTable<R extends { factor: number }>({
  rows,
  keyOf,
  setKey,
  options,
  onChange,
  keyLabel,
}: {
  rows: R[];
  keyOf(r: R): string;
  setKey(r: R, k: string): R;
  options: { id: string; name: string }[];
  onChange(rows: R[]): void;
  keyLabel: string;
}) {
  const T = useT();
  const blank = options[0];
  return (
    <div className="factor-table">
      <table className="data-table compact">
        <thead>
          <tr>
            <th>{keyLabel}</th>
            <th className="num">{T.dlg.loads.factor}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <select value={keyOf(r)} onChange={(e) => onChange(rows.map((x, j) => (j === i ? setKey(x, e.target.value) : x)))}>
                  {!options.some((o) => o.id === keyOf(r)) && <option value={keyOf(r)}>?</option>}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="num">
                <NumberField value={r.factor} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, factor: v } : x)))} label={T.dlg.loads.factor} width={90} />
              </td>
              <td>
                <button className="icon-btn" aria-label={T.dlg.delete} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Icon name="close" size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small" disabled={!blank} onClick={() => blank && onChange([...rows, setKey({ factor: 1 } as R, blank.id)])}>
        <Icon name="plus" size={12} /> {T.dlg.loads.addRow}
      </button>
    </div>
  );
}

function loadSections(T: Strings, model: Model): DefineSection[] {
  const L = T.dlg.loads;
  const patterns = (d: Drafts) => (d.loadPatterns ?? model.loadPatterns) as Item[];
  const cases = (d: Drafts) => (d.loadCases ?? model.loadCases) as Item[];
  const combos = (d: Drafts) => (d.combos ?? model.combos) as Item[];
  const pattern: DefineSection<LoadPattern & Item> = {
    collection: "loadPatterns",
    label: L.patterns,
    icon: "load",
    idPrefix: "lp",
    namePrefix: "LP",
    create: (id, name) => ({ id, name, type: "live", selfWeight: 0 }),
    form: (p, update) => (
      <>
        <Field label={L.type}>
          <select value={p.type} onChange={(e) => update({ type: e.target.value as LoadPattern["type"] })}>
            {(Object.keys(L.patternTypes) as LoadPattern["type"][]).map((k) => (
              <option key={k} value={k}>
                {L.patternTypes[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L.selfWeight}>
          <NumberField value={p.selfWeight} onChange={(selfWeight) => update({ selfWeight })} min={0} label={L.selfWeight} />
        </Field>
      </>
    ),
  };
  const lcase: DefineSection<LoadCase & Item> = {
    collection: "loadCases",
    label: L.cases,
    icon: "load",
    idPrefix: "lc",
    namePrefix: "LC",
    create: (id, name, d) => {
      const first = patterns(d)[0];
      return { id, name, type: "linearStatic", loads: first ? [{ pattern: first.id, factor: 1 }] : [] };
    },
    form: (c, update, { drafts }) => (
      <>
        <Field label={L.type}>
          <select value={c.type} onChange={(e) => update({ type: e.target.value as LoadCase["type"] })}>
            {(Object.keys(L.caseTypes) as LoadCase["type"][]).map((k) => (
              <option key={k} value={k}>
                {L.caseTypes[k]}
              </option>
            ))}
          </select>
        </Field>
        {c.type === "linearStatic" && (
          <Field label={L.loads}>
            <FactorTable
              rows={c.loads}
              keyOf={(r) => r.pattern}
              setKey={(r, k) => ({ ...r, pattern: k })}
              options={patterns(drafts)}
              onChange={(loads) => update({ loads })}
              keyLabel={L.pattern}
            />
          </Field>
        )}
      </>
    ),
  };
  const combo: DefineSection<LoadCombo & Item> = {
    collection: "combos",
    label: L.combos,
    icon: "combo",
    idPrefix: "co",
    namePrefix: "COMB",
    create: (id, name, d) => {
      const first = cases(d)[0];
      return { id, name, type: "linearAdd", items: first ? [{ case: first.id, factor: 1 }] : [] };
    },
    form: (c, update, { drafts }) => (
      <>
        <Field label={L.type}>
          <select value={c.type} onChange={(e) => update({ type: e.target.value as LoadCombo["type"] })}>
            {(Object.keys(L.comboTypes) as LoadCombo["type"][]).map((k) => (
              <option key={k} value={k}>
                {L.comboTypes[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L.items}>
          <FactorTable
            rows={c.items}
            keyOf={(r) => r.case}
            setKey={(r, k) => ({ ...r, case: k })}
            options={[...cases(drafts), ...combos(drafts).filter((x) => x.id !== c.id)]}
            onChange={(items) => update({ items })}
            keyLabel={L.case}
          />
        </Field>
      </>
    ),
  };
  return [pattern, lcase, combo] as unknown as DefineSection[];
}

export function LoadsDialog({ onClose, tab }: { onClose(): void; tab?: string }) {
  const T = useT();
  const model = useModel((s) => s.model);
  return (
    <DefineDialog
      title={T.dlg.loads.title}
      sections={loadSections(T, model)}
      {...(tab ? { initialTab: tab as DefinitionCollection } : {})}
      onClose={onClose}
      testId="dlg-loads"
    />
  );
}

export { fmtNum };

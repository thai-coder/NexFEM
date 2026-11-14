import { REPORT_KINDS, type Model } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { viewTitle } from "@nexfem/viewer";
import { useMemo, useState, type ReactNode } from "react";
import { runCommand, type CommandId } from "../../commands/app.ts";
import { openContextMenu } from "../../commands/context.ts";
import { useT, type T as Strings } from "../../i18n/index.ts";
import { useModel } from "../../stores/model.ts";
import { useUi, type BottomTab } from "../../stores/ui.ts";

interface Node {
  key: string;
  label: string;
  icon?: string;
  count?: number;
  /** id đối tượng để chọn khi bấm. */
  select?: string[];
  onClick?(): void;
  /** Lệnh mở khi bấm đúp (hộp thoại định nghĩa). */
  define?: CommandId;
  children?: Node[];
}

type Tab = "model" | "display" | "tables" | "reports";

export function ModelExplorer() {
  const T = useT();
  const [tab, setTab] = useState<Tab>("model");
  const [q, setQ] = useState("");
  return (
    <div className="explorer" data-testid="explorer">
      <div className="seg-tabs" role="tablist">
        {(["model", "display", "tables", "reports"] as const).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {id === "model" ? T.explorer.tabModel : id === "display" ? T.explorer.tabDisplay : id === "tables" ? T.explorer.tabTables : T.explorer.tabReports}
          </button>
        ))}
      </div>
      <div className="search-box">
        <Icon name="search" size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.explorer.search} aria-label={T.explorer.search} />
      </div>
      <div className="tree" role="tree">
        {tab === "model" && <ModelTree q={q} />}
        {tab === "display" && <DisplayTree q={q} />}
        {tab === "tables" && <TablesTree q={q} />}
        {tab === "reports" && <ReportsTree q={q} />}
      </div>
    </div>
  );
}

function groupByStory<T extends { id: string; label: string; story?: string | undefined }>(
  items: T[],
  model: Model,
  icon: string,
  prefix: string,
): Node[] {
  const out: Node[] = [];
  for (const s of [...model.stories].reverse()) {
    const list = items.filter((o) => o.story === s.id);
    if (!list.length) continue;
    out.push({
      key: `${prefix}-${s.id}`,
      label: s.name,
      icon: "story",
      count: list.length,
      select: list.map((o) => o.id),
      children: list.map((o) => ({ key: o.id, label: o.label, icon, select: [o.id] })),
    });
  }
  const rest = items.filter((o) => !o.story || !model.stories.some((s) => s.id === o.story));
  for (const o of rest) out.push({ key: o.id, label: o.label, icon, select: [o.id] });
  return out;
}

function buildModelTree(m: Model, T: Strings): Node[] {
  const grid = m.grids[0];
  const leaf = (o: { id: string; name: string }, icon: string): Node => ({ key: o.id, label: o.name, icon, select: [o.id] });
  return [
    {
      key: "project",
      label: m.name,
      icon: "folder",
      children: [
        {
          key: "grids",
          label: T.explorer.grids,
          icon: "grid",
          define: "define.grids",
          count: grid ? grid.x.length + grid.y.length : 0,
          children: grid
            ? [...grid.x, ...grid.y].map((l) => ({
                key: l.id,
                label: `${l.label}   ${l.coord.toFixed(3)}`,
                icon: "grid",
                onClick: () => {
                  const s = useUi.getState();
                  s.setView(s.activePane, { kind: "elevation", grid: grid.id, line: l.id });
                },
              }))
            : [],
        },
        {
          key: "stories",
          label: T.explorer.stories,
          icon: "story",
          define: "define.stories",
          count: m.stories.length,
          children: [...m.stories].reverse().map((s) => ({
            key: s.id,
            label: `${s.name}   ${s.elevation.toFixed(3)}`,
            icon: "story",
            onClick: () => {
              const ui = useUi.getState();
              ui.setView(ui.activePane, { kind: "plan", story: s.id });
            },
          })),
        },
      ],
    },
    {
      key: "properties",
      label: T.explorer.properties,
      icon: "folder",
      children: [
        { key: "materials", label: T.explorer.materials, icon: "material", define: "define.materials", count: m.materials.length, children: m.materials.map((o) => leaf(o, "material")) },
        { key: "frameSections", label: T.explorer.frameSections, icon: "section", define: "define.frameSections", count: m.frameSections.length, children: m.frameSections.map((o) => leaf(o, "section")) },
        { key: "shellSections", label: T.explorer.shellSections, icon: "slab", define: "define.shellSections", count: m.shellSections.length, children: m.shellSections.map((o) => leaf(o, "slab")) },
        { key: "loadPatterns", label: T.explorer.loadPatterns, icon: "load", define: "define.loadPatterns", count: m.loadPatterns.length, children: m.loadPatterns.map((o) => leaf(o, "load")) },
        { key: "loadCases", label: T.explorer.loadCases, icon: "load", define: "define.loadCases", count: m.loadCases.length, children: m.loadCases.map((o) => leaf(o, "load")) },
        { key: "combos", label: T.explorer.combos, icon: "combo", define: "define.combos", count: m.combos.length, children: m.combos.map((o) => leaf(o, "combo")) },
      ],
    },
    {
      key: "objects",
      label: T.explorer.objects,
      icon: "folder",
      children: [
        { key: "joints", label: T.explorer.joints, icon: "joint", count: m.joints.length, children: groupByStory(m.joints, m, "joint", "j") },
        { key: "frames", label: T.explorer.frames, icon: "beam", count: m.frames.length, select: m.frames.map((f) => f.id), children: groupByStory(m.frames, m, "beam", "f") },
        { key: "shells", label: T.explorer.shells, icon: "slab", count: m.shells.length, select: m.shells.map((s) => s.id), children: groupByStory(m.shells, m, "slab", "s") },
      ],
    },
  ];
}

function filterTree(nodes: Node[], q: string): Node[] {
  if (!q) return nodes;
  const nq = q.toLowerCase();
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.label.toLowerCase().includes(nq)) {
      out.push(n);
      continue;
    }
    const kids = n.children ? filterTree(n.children, q) : [];
    if (kids.length) out.push({ ...n, children: kids });
  }
  return out;
}

function ModelTree({ q }: { q: string }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const nodes = useMemo(() => filterTree(buildModelTree(model, T), q.trim()), [model, T, q]);
  return <TreeView nodes={nodes} forceOpen={!!q.trim()} defaultOpen={["project", "properties", "objects", "frameSections", "materials"]} />;
}

function DisplayTree({ q }: { q: string }) {
  const T = useT();
  const model = useModel((s) => s.model);
  const views = useUi((s) => s.views);
  const labels = { plan: T.view.plan, elevation: T.view.elevation, view3d: T.view.view3d, axis: T.view.axis };
  const nodes: Node[] = [
    {
      key: "views",
      label: T.explorer.savedViews,
      icon: "view3d",
      children: views.map((v, i) => ({
        key: `view-${i}`,
        label: `${i + 1}. ${viewTitle(model, v, labels)}`,
        icon: v.kind === "3d" ? "view3d" : v.kind === "plan" ? "plan" : "elevation",
        onClick: () => {
          const s = useUi.getState();
          const need = i === 0 ? 1 : i === 1 ? 2 : 4;
          if (s.layout < need) s.setLayout(need);
          s.set({ activePane: i });
        },
      })),
    },
  ];
  return <TreeView nodes={filterTree(nodes, q.trim())} forceOpen defaultOpen={["views"]} />;
}

function TablesTree({ q }: { q: string }) {
  const T = useT();
  const open = (type: string) => {
    const s = useUi.getState();
    s.set({ bottomTab: "tables" as BottomTab, panels: { ...s.panels, bottom: true } });
    window.dispatchEvent(new CustomEvent("nexfem:table", { detail: type }));
  };
  const nodes: Node[] = [
    {
      key: "tables",
      label: T.explorer.tableList,
      icon: "table",
      children: (["frames", "joints", "shells", "stories"] as const).map((k) => ({ key: `t-${k}`, label: T.tables[k], icon: "table", onClick: () => open(k) })),
    },
  ];
  return <TreeView nodes={filterTree(nodes, q.trim())} forceOpen defaultOpen={["tables"]} />;
}

function ReportsTree({ q }: { q: string }) {
  const T = useT();
  const nodes: Node[] = [
    {
      key: "reports",
      label: T.explorer.reportList,
      icon: "table",
      children: REPORT_KINDS.map((k) => ({
        key: `r-${k}`,
        label: T.reports.kinds[k],
        icon: "table",
        onClick: () => useUi.getState().set({ dialog: { kind: "report", report: k } }),
      })),
    },
  ];
  return <TreeView nodes={filterTree(nodes, q.trim())} forceOpen defaultOpen={["reports"]} />;
}

function TreeView({ nodes, forceOpen, defaultOpen }: { nodes: Node[]; forceOpen: boolean; defaultOpen: string[] }) {
  const T = useT();
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const selection = useModel((s) => s.selection);
  const selected = useMemo(() => new Set(selection), [selection]);
  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  if (!nodes.length) return <div className="empty">{T.explorer.empty}</div>;

  const render = (n: Node, depth: number): ReactNode => {
    const hasKids = !!n.children?.length;
    const isOpen = forceOpen || open.has(n.key);
    const isSel = !!n.select && n.select.length === 1 && selected.has(n.select[0]!);
    return (
      <div key={n.key} role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-selected={isSel}>
        <div
          className={`tree-row${isSel ? " selected" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={(e) => {
            if (n.select) useModel.getState().select(n.select, e.ctrlKey || e.metaKey ? "toggle" : "replace");
            else if (n.onClick) n.onClick();
            else if (hasKids) toggle(n.key);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const ms = useModel.getState();
            if (n.select && !(n.select.length === 1 && ms.selection.includes(n.select[0]!))) ms.select(n.select);
            openContextMenu(e.clientX, e.clientY, { extra: n.define ? [n.define] : [] });
          }}
          onDoubleClick={() => {
            if (n.define) runCommand(n.define);
            else if (hasKids) toggle(n.key);
          }}
          title={n.label}
        >
          <span
            className="tree-twisty"
            onClick={(e) => {
              e.stopPropagation();
              if (hasKids) toggle(n.key);
            }}
          >
            {hasKids ? <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={12} /> : null}
          </span>
          {n.icon && <Icon name={n.icon} size={14} className="tree-icon" />}
          <span className="tree-label">{n.label}</span>
          {n.count !== undefined && <span className="tree-count">{n.count}</span>}
        </div>
        {hasKids && isOpen && <div role="group">{n.children!.map((c) => render(c, depth + 1))}</div>}
      </div>
    );
  };
  return <>{nodes.map((n) => render(n, 0))}</>;
}

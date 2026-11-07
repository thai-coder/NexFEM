import { definitionUsages, uniqueId, allIds, type DefinitionCollection, type Model } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "../i18n/index.ts";
import { useModel } from "../stores/model.ts";
import { Field } from "./fields.tsx";
import { Modal } from "./Modal.tsx";

export type Item = { id: string; name: string } & Record<string, unknown>;

export interface DefineSection<T extends Item = Item> {
  collection: DefinitionCollection;
  label: string;
  /** Tạo mục mới với id cho trước. */
  create(id: string, name: string, draft: Drafts): T;
  /** Tiền tố id và tên mặc định. */
  idPrefix: string;
  namePrefix: string;
  /** Form chỉnh mục đang chọn. */
  form(item: T, update: (patch: Partial<T>) => void, ctx: { model: Model; drafts: Drafts }): ReactNode;
  /** Danh sách mẫu để "Thêm từ thư viện". */
  library?: T[];
  icon?: string;
}

export type Drafts = Partial<Record<DefinitionCollection, Item[]>>;

const ORDER: DefinitionCollection[] = ["materials", "frameSections", "shellSections", "loadPatterns", "loadCases", "combos"];

/** Tạo lô lệnh từ bản nháp: thêm/sửa trước theo thứ tự phụ thuộc, xoá sau theo thứ tự ngược. */
export function diffOps(model: Model, drafts: Drafts): { name: string; args: unknown }[] {
  const upserts: { name: string; args: unknown }[] = [];
  const deletes: { name: string; args: unknown }[] = [];
  for (const c of ORDER) {
    const draft = drafts[c];
    if (!draft) continue;
    const orig = model[c] as unknown as Item[];
    const byId = new Map(orig.map((o) => [o.id, o]));
    for (const item of draft) {
      const o = byId.get(item.id);
      if (!o || JSON.stringify(o) !== JSON.stringify(item)) upserts.push({ name: "definition.upsert", args: { collection: c, item } });
    }
    const keep = new Set(draft.map((i) => i.id));
    for (const o of orig) if (!keep.has(o.id)) deletes.unshift({ name: "definition.delete", args: { collection: c, id: o.id } });
  }
  return [...upserts, ...deletes];
}

/**
 * Khuôn hộp thoại định nghĩa: danh sách bên trái, form bên phải, có tab khi nhiều bộ sưu tập.
 * Mọi thay đổi nằm trong bản nháp; OK/Áp dụng ghi thành một bước Undo.
 */
export function DefineDialog({
  title,
  sections,
  initialTab,
  onClose,
  testId,
  footerNote,
}: {
  title: string;
  sections: DefineSection[];
  initialTab?: DefinitionCollection;
  onClose(): void;
  testId?: string;
  footerNote?: string;
}) {
  const T = useT();
  const model = useModel((s) => s.model);
  const locked = useModel((s) => s.locked);
  const executeBatch = useModel((s) => s.executeBatch);
  const [drafts, setDrafts] = useState<Drafts>(() => Object.fromEntries(sections.map((s) => [s.collection, structuredClone(model[s.collection]) as Item[]])));
  const [tab, setTab] = useState<DefinitionCollection>(initialTab ?? sections[0]!.collection);
  const [selected, setSelected] = useState<Record<string, string | undefined>>(() =>
    Object.fromEntries(sections.map((s) => [s.collection, (model[s.collection] as Item[])[0]?.id])),
  );
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const section = sections.find((s) => s.collection === tab)!;
  const list = drafts[tab] ?? [];
  const current = list.find((i) => i.id === selected[tab]);
  const ops = useMemo(() => diffOps(model, drafts), [model, drafts]);
  const usages = current ? definitionUsages(model, tab, current.id) : [];

  const setList = (c: DefinitionCollection, f: (l: Item[]) => Item[]) => setDrafts((d) => ({ ...d, [c]: f(d[c] ?? []) }));
  const usedIds = () => [...allIds(model), ...Object.values(drafts).flatMap((l) => (l ?? []).map((i) => i.id))];
  const freeName = (base: string) => {
    const names = new Set(list.map((i) => i.name.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  };
  const add = (item: Item) => {
    setList(tab, (l) => [...l, item]);
    setSelected((s) => ({ ...s, [tab]: item.id }));
    setError(null);
  };

  const apply = (close: boolean) => {
    const err = executeBatch(title, ops);
    setError(err);
    if (!err && close) onClose();
  };

  const filtered = list.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Modal
      title={title}
      onClose={onClose}
      testId={testId}
      width={820}
      footer={
        <>
          <div className={`modal-error${error ? " is-error" : ""}`} role="alert">
            {error ?? footerNote ?? ""}
          </div>
          <button className="btn" onClick={onClose}>
            {T.dlg.cancel}
          </button>
          <button className="btn" disabled={!ops.length || locked} onClick={() => apply(false)}>
            {T.dlg.apply}
          </button>
          <button className="btn primary" disabled={locked} onClick={() => (ops.length ? apply(true) : onClose())} data-testid="dialog-ok">
            {T.dlg.ok}
          </button>
        </>
      }
    >
      {sections.length > 1 && (
        <div className="seg-tabs left dialog-tabs" role="tablist">
          {sections.map((s) => (
            <button key={s.collection} role="tab" aria-selected={tab === s.collection} className={tab === s.collection ? "active" : ""} onClick={() => setTab(s.collection)}>
              {s.label} <span className="tree-count">{drafts[s.collection]?.length ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      <div className="define-layout">
        <div className="define-list">
          <div className="search-box">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.dlg.filter} aria-label={T.dlg.filter} />
          </div>
          <div className="define-items" role="listbox" aria-label={section.label}>
            {filtered.length === 0 && <div className="empty">{T.dlg.noItems}</div>}
            {filtered.map((i) => (
              <button
                key={i.id}
                role="option"
                aria-selected={i.id === current?.id}
                className={`define-item${i.id === current?.id ? " active" : ""}`}
                onClick={() => setSelected((s) => ({ ...s, [tab]: i.id }))}
              >
                {section.icon && <Icon name={section.icon} size={14} />}
                <span>{i.name}</span>
              </button>
            ))}
          </div>
          <div className="define-actions">
            <button
              className="btn small"
              disabled={locked}
              data-testid="define-add"
              onClick={() => add(section.create(uniqueId(section.idPrefix, usedIds()), freeName(section.namePrefix), drafts))}
            >
              <Icon name="plus" size={12} /> {T.dlg.add}
            </button>
            <button
              className="btn small"
              disabled={!current || locked}
              onClick={() => current && add({ ...structuredClone(current), id: uniqueId(section.idPrefix, usedIds()), name: freeName(`${current.name} ${T.dlg.copySuffix}`) })}
            >
              {T.dlg.copy}
            </button>
            <button
              className="btn small"
              disabled={!current || usages.length > 0 || locked}
              title={usages.length ? T.fmt(T.dlg.inUse, { list: usages.slice(0, 6).join(", ") }) : undefined}
              onClick={() => {
                if (!current) return;
                const idx = list.findIndex((i) => i.id === current.id);
                const next = list.filter((i) => i.id !== current.id);
                setList(tab, () => next);
                setSelected((s) => ({ ...s, [tab]: next[Math.min(idx, next.length - 1)]?.id }));
              }}
            >
              {T.dlg.delete}
            </button>
          </div>
          {section.library && (
            <select
              className="library-select"
              value=""
              disabled={locked}
              aria-label={T.dlg.fromLibrary}
              onChange={(e) => {
                const lib = section.library!.find((x) => x.id === e.target.value);
                if (lib) add({ ...structuredClone(lib), id: uniqueId(section.idPrefix, usedIds()), name: freeName(lib.name) });
              }}
            >
              <option value="">{T.dlg.fromLibrary}</option>
              {section.library.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="define-form">
          {current ? (
            <fieldset disabled={locked} className="plain-fieldset">
              <Field label={T.dlg.name}>
                <input
                  value={current.name}
                  data-testid="define-name"
                  onChange={(e) => setList(tab, (l) => l.map((i) => (i.id === current.id ? { ...i, name: e.target.value } : i)))}
                />
              </Field>
              {section.form(current, (patch) => setList(tab, (l) => l.map((i) => (i.id === current.id ? { ...i, ...patch } : i))), { model, drafts })}
              {usages.length > 0 && <p className="form-hint">{T.fmt(T.dlg.inUse, { list: usages.slice(0, 8).join(", ") + (usages.length > 8 ? " …" : "") })}</p>}
            </fieldset>
          ) : (
            <div className="empty">{T.dlg.noItems}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

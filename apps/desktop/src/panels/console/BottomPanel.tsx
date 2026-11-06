import type { Model } from "@nexfem/model-core";
import { frameLength, jointMap, toDisplay, unitLabel } from "@nexfem/model-core";
import { Icon } from "@nexfem/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { currentStory, runCommand } from "../../commands/app.ts";
import { useT } from "../../i18n/index.ts";
import { useModel } from "../../stores/model.ts";
import { useUi, type BottomTab, type LogEntry } from "../../stores/ui.ts";
import { parseConsole } from "./parse.ts";

export function BottomPanel() {
  const T = useT();
  const tab = useUi((s) => s.bottomTab);
  const set = useUi((s) => s.set);
  const messages = useUi((s) => s.messages);
  const warn = messages?.filter((m) => m.level !== "info").length ?? 0;
  const tabs: [BottomTab, string, string][] = [
    ["console", T.panel.console, "terminal"],
    ["messages", T.panel.messages, "warning"],
    ["tables", T.panel.tables, "table"],
    ["log", T.panel.log, "run"],
  ];
  return (
    <div className="bottom" data-testid="bottom">
      <div className="seg-tabs left" role="tablist">
        {tabs.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => set({ bottomTab: id })}>
            <Icon name={icon} size={13} />
            {label}
            {id === "messages" && warn > 0 && <span className="badge">{warn}</span>}
          </button>
        ))}
      </div>
      <div className="bottom-body">
        {tab === "console" && <Console />}
        {tab === "messages" && <Messages />}
        {tab === "tables" && <Tables />}
        {tab === "log" && <LogList filter={(l) => l.source === "analysis"} />}
      </div>
    </div>
  );
}

function LogList({ filter }: { filter?(l: LogEntry): boolean }) {
  const logs = useUi((s) => s.logs);
  const list = filter ? logs.filter(filter) : logs;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView có thể trả về Promise trên Chromium mới; không trả giá trị cho React.
    end.current?.scrollIntoView({ block: "end" });
  }, [list.length]);
  return (
    <div className="log-list" role="log" aria-live="polite">
      {list.map((l) => (
        <div key={l.id} className={`log-line ${l.level}`}>
          <span className="log-time">{l.time.toLocaleTimeString()}</span>
          {l.source && l.source !== "ui" && <span className="log-source">{l.source}</span>}
          <span className="log-text">{l.text}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Console() {
  const T = useT();
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const log = useUi((s) => s.log);

  const submit = () => {
    const line = value.trim();
    if (!line) return;
    setHistory((h) => [...h, line]);
    setHIdx(-1);
    setValue("");
    log("command", `> ${line}`, "console");
    const a = parseConsole(line);
    const ms = useModel.getState();
    const story = ms.model.stories.find((s) => s.id === currentStory());
    const z = story?.elevation ?? 0;
    const below = [...ms.model.stories].reverse().find((s) => s.elevation < z - 1e-6);
    const beamSection = ms.model.frameSections.find((s) => s.id === "sec-beam")?.id ?? ms.model.frameSections[0]?.id ?? "";
    const colSection = ms.model.frameSections.find((s) => s.id === "sec-col")?.id ?? ms.model.frameSections[0]?.id ?? "";
    switch (a.kind) {
      case "help":
        return log("info", T.console.help, "console");
      case "clear":
        return useUi.getState().clearLog();
      case "app":
        return runCommand(a.command);
      case "select": {
        const m = ms.model;
        const hit = [...m.frames, ...m.shells, ...m.joints].find((o) => o.label.toLowerCase() === a.label.toLowerCase());
        if (!hit) return log("warning", T.fmt(T.console.notFound, { label: a.label }), "console");
        ms.select([hit.id]);
        return;
      }
      case "beam": {
        const id = ms.execute("frame.add", { kind: "beam", from: [...a.from, z], to: [...a.to, z], section: beamSection, story: story?.id }, "console");
        if (typeof id === "string") ms.select([id]);
        return;
      }
      case "column": {
        if (!below) return log("warning", "Không có tầng bên dưới", "console");
        const id = ms.execute(
          "frame.add",
          { kind: "column", from: [...a.at, below.elevation], to: [...a.at, z], section: colSection, story: story?.id },
          "console",
        );
        if (typeof id === "string") ms.select([id]);
        return;
      }
      case "raw":
        ms.execute(a.name, a.args, "console");
        return;
      case "error":
        return log("warning", a.message.startsWith("unknown:") ? T.fmt(T.console.unknown, { cmd: a.message.slice(8) }) : a.message, "console");
    }
  };

  return (
    <div className="console">
      <LogList />
      <div className="console-input">
        <span className="prompt">&gt;</span>
        <input
          value={value}
          placeholder={T.console.placeholder}
          aria-label="Console"
          data-testid="console-input"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "ArrowUp" && history.length) {
              const i = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1);
              setHIdx(i);
              setValue(history[i]!);
            } else if (e.key === "ArrowDown" && hIdx >= 0) {
              const i = hIdx + 1;
              if (i >= history.length) {
                setHIdx(-1);
                setValue("");
              } else {
                setHIdx(i);
                setValue(history[i]!);
              }
            } else return;
            e.preventDefault();
          }}
        />
      </div>
    </div>
  );
}

function Messages() {
  const T = useT();
  const messages = useUi((s) => s.messages);
  const select = useModel((s) => s.select);
  if (!messages) return <div className="empty pad">{T.messages.none}</div>;
  if (!messages.length) return <div className="empty pad ok">{T.messages.ok}</div>;
  return (
    <div className="msg-list">
      {messages.map((m, i) => (
        <button key={i} className={`msg ${m.level}`} onClick={() => m.objects.length && select(m.objects)}>
          <Icon name={m.level === "error" ? "error" : m.level === "warning" ? "warning" : "info"} size={14} />
          <span>{T.fmt(T.messages[m.code], m.params)}</span>
        </button>
      ))}
    </div>
  );
}

type TableKind = "frames" | "joints" | "shells" | "stories";

interface Column {
  head: string;
  cell(row: unknown): ReactNode;
  num?: boolean;
}

function tableDef(kind: TableKind, m: Model, T: ReturnType<typeof useT>): { rows: { id: string }[]; cols: Column[] } {
  const u = m.units;
  const L = unitLabel("length", u);
  const len = (v: number) => toDisplay(v, "length", u).toFixed(3);
  const storyName = (id?: string) => m.stories.find((s) => s.id === id)?.name ?? "";
  switch (kind) {
    case "frames": {
      const joints = jointMap(m);
      return {
        rows: m.frames,
        cols: [
          { head: T.props.label, cell: (r) => (r as Model["frames"][number]).label },
          { head: T.props.kind, cell: (r) => T.props[(r as Model["frames"][number]).kind] },
          { head: T.props.story, cell: (r) => storyName((r as Model["frames"][number]).story) },
          { head: T.props.section, cell: (r) => m.frameSections.find((s) => s.id === (r as Model["frames"][number]).section)?.name },
          { head: `${T.props.length} (${L})`, num: true, cell: (r) => len(frameLength(r as Model["frames"][number], joints)) },
        ],
      };
    }
    case "joints":
      return {
        rows: m.joints,
        cols: [
          { head: T.props.label, cell: (r) => (r as Model["joints"][number]).label },
          { head: T.props.story, cell: (r) => storyName((r as Model["joints"][number]).story) },
          { head: `X (${L})`, num: true, cell: (r) => len((r as Model["joints"][number]).x) },
          { head: `Y (${L})`, num: true, cell: (r) => len((r as Model["joints"][number]).y) },
          { head: `Z (${L})`, num: true, cell: (r) => len((r as Model["joints"][number]).z) },
          {
            head: T.props.restraint,
            cell: (r) => {
              const x = (r as Model["joints"][number]).restraint;
              return x ? x.map((v) => (v ? "1" : "0")).join("") : "";
            },
          },
        ],
      };
    case "shells":
      return {
        rows: m.shells,
        cols: [
          { head: T.props.label, cell: (r) => (r as Model["shells"][number]).label },
          { head: T.props.kind, cell: (r) => T.props[(r as Model["shells"][number]).kind] },
          { head: T.props.story, cell: (r) => storyName((r as Model["shells"][number]).story) },
          { head: T.props.section, cell: (r) => m.shellSections.find((s) => s.id === (r as Model["shells"][number]).section)?.name },
        ],
      };
    case "stories":
      return {
        rows: [...m.stories].reverse(),
        cols: [
          { head: T.props.label, cell: (r) => (r as Model["stories"][number]).name },
          { head: `${T.props.length} (${L})`, num: true, cell: (r) => len((r as Model["stories"][number]).height) },
          { head: `Z (${L})`, num: true, cell: (r) => len((r as Model["stories"][number]).elevation) },
        ],
      };
  }
}

function Tables() {
  const T = useT();
  const [kind, setKind] = useState<TableKind>("frames");
  const model = useModel((s) => s.model);
  const selection = useModel((s) => s.selection);
  const select = useModel((s) => s.select);
  const sel = useMemo(() => new Set(selection), [selection]);
  useEffect(() => {
    const h = (e: Event) => setKind((e as CustomEvent<TableKind>).detail);
    window.addEventListener("nexfem:table", h);
    return () => window.removeEventListener("nexfem:table", h);
  }, []);
  const { rows, cols } = tableDef(kind, model, T);
  const shown = rows.slice(0, 2000);
  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <label>
          {T.tables.type}{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value as TableKind)}>
            {(["frames", "joints", "shells", "stories"] as const).map((k) => (
              <option key={k} value={k}>
                {T.tables[k]}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{T.fmt(T.tables.rows, { n: rows.length })}</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.head} className={c.num ? "num" : undefined}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? "selected" : undefined} onClick={(e) => kind !== "stories" && select([r.id], e.ctrlKey || e.metaKey ? "toggle" : "replace")}>
                {cols.map((c) => (
                  <td key={c.head} className={c.num ? "num" : undefined}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

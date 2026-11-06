/** Phân tích lệnh gõ trong Console. Thuần (không phụ thuộc React) để kiểm thử. */
export type ConsoleAction =
  | { kind: "help" }
  | { kind: "clear" }
  | { kind: "app"; command: "edit.undo" | "edit.redo" | "view.zoomExtents" | "analyze.check" | "analyze.run" }
  | { kind: "select"; label: string }
  | { kind: "beam"; from: [number, number]; to: [number, number] }
  | { kind: "column"; at: [number, number] }
  | { kind: "raw"; name: string; args: unknown }
  | { kind: "error"; message: string };

function point(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const parts = s.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 2 || parts.some((x) => !Number.isFinite(x))) return null;
  return [parts[0]!, parts[1]!];
}

export function parseConsole(input: string): ConsoleAction {
  const line = input.trim();
  const [head = "", ...rest] = line.split(/\s+/);
  switch (head.toLowerCase()) {
    case "help":
    case "?":
      return { kind: "help" };
    case "clear":
    case "cls":
      return { kind: "clear" };
    case "undo":
      return { kind: "app", command: "edit.undo" };
    case "redo":
      return { kind: "app", command: "edit.redo" };
    case "zoom":
      return { kind: "app", command: "view.zoomExtents" };
    case "check":
      return { kind: "app", command: "analyze.check" };
    case "run":
      return { kind: "app", command: "analyze.run" };
    case "select":
    case "sel":
      return rest[0] ? { kind: "select", label: rest[0] } : { kind: "error", message: "select <nhãn>" };
    case "beam": {
      const a = point(rest[0]);
      const b = point(rest[1]);
      return a && b ? { kind: "beam", from: a, to: b } : { kind: "error", message: "beam x1,y1 x2,y2" };
    }
    case "column":
    case "col": {
      const a = point(rest[0]);
      return a ? { kind: "column", at: a } : { kind: "error", message: "column x,y" };
    }
    case "cmd": {
      const name = rest[0];
      if (!name) return { kind: "error", message: "cmd <tên lệnh> <json>" };
      const json = line.slice(line.indexOf(name) + name.length).trim();
      try {
        return { kind: "raw", name, args: json ? JSON.parse(json) : {} };
      } catch {
        return { kind: "error", message: "JSON không hợp lệ" };
      }
    }
    default:
      return { kind: "error", message: `unknown:${head}` };
  }
}

import type { Frame, Joint } from "@nexfem/model-core";

/**
 * Tìm chỗ đặt tải tập trung theo toạ độ cho điểm CSI không phải đầu thanh/sàn nào đã nhập.
 * ETABS/SAP2000 tự chia thanh tại điểm nằm trên thanh (auto mesh), nên tải ở điểm đó truyền vào thanh.
 * - Trùng một nút đã có (trong dung sai): đặt tải lên nút đó.
 * - Nằm trong đoạn một thanh: trả về thanh và vị trí tương đối; lực tại đó tương đương chính xác với tải tập trung trên thanh.
 */
export function locatePoint(
  p: { x: number; y: number; z: number },
  joints: readonly Joint[],
  frames: readonly Frame[],
  tol: number,
): { joint: Joint } | { frame: Frame; at: number } | null {
  const used = new Set(frames.flatMap((f) => [f.i, f.j]));
  for (const j of joints) if (used.has(j.id) && Math.hypot(j.x - p.x, j.y - p.y, j.z - p.z) <= tol) return { joint: j };
  const byId = new Map(joints.map((j) => [j.id, j]));
  let best: { frame: Frame; at: number; dist: number } | null = null;
  for (const f of frames) {
    const a = byId.get(f.i);
    const b = byId.get(f.j);
    if (!a || !b) continue;
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    if (!(len2 > 0)) continue;
    const t = ((p.x - a.x) * d[0]! + (p.y - a.y) * d[1]! + (p.z - a.z) * d[2]!) / len2;
    if (t <= 0 || t >= 1) continue;
    const dist = Math.hypot(a.x + t * d[0]! - p.x, a.y + t * d[1]! - p.y, a.z + t * d[2]! - p.z);
    if (dist <= tol && (!best || dist < best.dist)) best = { frame: f, at: t, dist };
  }
  return best ? { frame: best.frame, at: Number(best.at.toPrecision(12)) } : null;
}

type P3 = { x: number; y: number; z: number };
type V3 = [number, number, number];

/**
 * Trục địa phương của thanh như fem-solver `local_axes`: e1 từ i đến j; thanh đứng: e2 = +X, còn lại e2 hướng lên
 * trong mặt phẳng đứng; e3 = e1 × e2; góc `angle` (độ) xoay e2, e3 quanh e1 (quy ước CSI).
 */
export function frameAxes(a: P3, b: P3, angle = 0): [V3, V3, V3] {
  const d: V3 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const l = Math.hypot(...d);
  const e1 = d.map((v) => v / l) as V3;
  let e2: V3;
  if (Math.abs(e1[2]) > 1 - 1e-6) e2 = [1, 0, 0];
  else {
    const p: V3 = [-e1[2] * e1[0], -e1[2] * e1[1], 1 - e1[2] * e1[2]];
    const n = Math.hypot(...p);
    e2 = p.map((v) => v / n) as V3;
  }
  const cross = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  let e3 = cross(e1, e2);
  if (angle) {
    const r = (angle * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    e2 = [c * e2[0] + s * e3[0], c * e2[1] + s * e3[1], c * e2[2] + s * e3[2]];
    e3 = cross(e1, e2);
  }
  return [e1, e2, e3];
}

/** Trục tổng thể (0 = X, 1 = Y, 2 = Z) trùng phương với vector đơn vị `v`, hoặc −1 nếu xiên. */
export function globalAxisOf(v: V3): number {
  return v.findIndex((c) => Math.abs(c) > 1 - 1e-6);
}

/** Diện tích chịu tải của từng đỉnh đa giác: chia tam giác từ trọng tâm, mỗi đỉnh nhận nửa hai tam giác kề. Hình chữ nhật → A/4 mỗi góc. */
export function cornerAreas(pts: readonly P3[]): number[] {
  const n = pts.length;
  const c = pts.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n, z: s.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const tri = (p: P3, q: P3) => {
    const u: V3 = [p.x - c.x, p.y - c.y, p.z - c.z];
    const v: V3 = [q.x - c.x, q.y - c.y, q.z - c.z];
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  };
  const t = pts.map((p, k) => tri(p, pts[(k + 1) % n]!));
  return pts.map((_, k) => (t[(k - 1 + n) % n]! + t[k]!) / 2);
}

/** Đoạn của một thanh sau khi chia: id mới và khoảng tham số [t0, t1] trên thanh gốc. */
export interface FrameSegment {
  id: string;
  t0: number;
  t1: number;
}

/**
 * Chia thanh tại các nút (đầu thanh khác, góc sàn) nằm trên thân thanh, như ETABS/SAP2000 tự chia thanh (auto mesh tại nút).
 * Chỉ chia thanh `canSplit` cho phép. Nhả liên kết và vùng cứng giữ ở hai đầu ngoài; các thuộc tính khác chép sang mọi đoạn.
 * Thanh được chia nhận nhãn "B6-1", "B6-2"…; thanh không chia giữ nguyên.
 */
export function splitFramesAtJoints(
  frames: readonly Frame[],
  joints: readonly Joint[],
  extraNodes: Iterable<string>,
  canSplit: (f: Frame) => boolean,
  tol: number,
): { frames: Frame[]; segments: Map<string, FrameSegment[]>; hostOf: Map<string, string> } {
  const byId = new Map(joints.map((j) => [j.id, j]));
  const nodes = new Set([...frames.flatMap((f) => [f.i, f.j]), ...extraNodes]);
  const cand = [...nodes].map((id) => byId.get(id)!).filter(Boolean);
  const out: Frame[] = [];
  const segments = new Map<string, FrameSegment[]>();
  const hostOf = new Map<string, string>();
  for (const f of frames) {
    const a = byId.get(f.i);
    const b = byId.get(f.j);
    if (!a || !b || !canSplit(f)) {
      out.push(f);
      continue;
    }
    const d = [b.x - a.x, b.y - a.y, b.z - a.z] as const;
    const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    const len = Math.sqrt(len2);
    const cuts: { t: number; id: string }[] = [];
    for (const p of cand) {
      if (p.id === f.i || p.id === f.j) continue;
      const t = ((p.x - a.x) * d[0] + (p.y - a.y) * d[1] + (p.z - a.z) * d[2]) / len2;
      if (t * len <= tol || (1 - t) * len <= tol) continue;
      if (Math.hypot(a.x + t * d[0] - p.x, a.y + t * d[1] - p.y, a.z + t * d[2] - p.z) <= tol) cuts.push({ t, id: p.id });
    }
    if (!cuts.length) {
      out.push(f);
      continue;
    }
    cuts.sort((x, y) => x.t - y.t);
    const pts = [{ t: 0, id: f.i }, ...cuts, { t: 1, id: f.j }];
    const list: FrameSegment[] = [];
    const none = [false, false, false, false, false, false];
    for (let k = 0; k + 1 < pts.length; k++) {
      const id = `${f.id}-${k + 1}`;
      const first = k === 0;
      const last = k + 2 === pts.length;
      const { releases, offsets, ...rest } = f;
      const seg: Frame = { ...rest, id, label: `${f.label}-${k + 1}`, i: pts[k]!.id, j: pts[k + 1]!.id };
      if (releases) {
        const i = first ? releases.i : none;
        const j = last ? releases.j : none;
        if (i.some(Boolean) || j.some(Boolean)) seg.releases = { i: [...i], j: [...j] };
      }
      if (offsets && ((first && offsets.i > 0) || (last && offsets.j > 0))) seg.offsets = { i: first ? offsets.i : 0, j: last ? offsets.j : 0 };
      out.push(seg);
      list.push({ id, t0: pts[k]!.t, t1: pts[k + 1]!.t });
      hostOf.set(id, f.id);
    }
    segments.set(f.id, list);
  }
  return { frames: out, segments, hostOf };
}

/** Chuyển tải của thanh gốc sang các đoạn: tải đều chép cho mọi đoạn; tải tập trung vào đoạn chứa vị trí, đổi lại vị trí tương đối. */
export function remapFrameLoads<T extends { id: string; frame: string; kind: "distributed" | "point"; at?: number }>(loads: readonly T[], segments: ReadonlyMap<string, FrameSegment[]>): T[] {
  const out: T[] = [];
  for (const l of loads) {
    const segs = segments.get(l.frame);
    if (!segs) {
      out.push(l);
      continue;
    }
    if (l.kind === "distributed") {
      segs.forEach((s, k) => out.push({ ...l, id: `${l.id}-${k + 1}`, frame: s.id }));
      continue;
    }
    const at = l.at ?? 0.5;
    const s = segs.find((x) => at >= x.t0 - 1e-12 && at <= x.t1 + 1e-12) ?? segs[segs.length - 1]!;
    out.push({ ...l, frame: s.id, at: Math.min(1, Math.max(0, Number(((at - s.t0) / (s.t1 - s.t0)).toPrecision(12)))) });
  }
  return out;
}

/**
 * Diện tích chịu tải của các nút trên một tấm phẳng khi chia tấm tại các nút nằm bên trong nó, như ETABS/SAP2000
 * tự chia sàn khi phân tích (ví dụ chân cột đặt giữa tấm móng). Chỉ nhận nút cách mặt phẳng tấm không quá `tol`
 * và nằm trong đa giác (kể cả trên cạnh); nút lệch mặt phẳng (ví dụ đỉnh cột phía trên) không bị ghép.
 * Không có nút bên trong: giữ đúng `cornerAreas`. Có nút bên trong: chia tam giác (quạt từ nút bên trong đầu tiên
 * với tấm lồi, cắt tai với tấm lõm, rồi chèn các nút còn lại) và mỗi tam giác chia đều 1/3 diện tích cho ba đỉnh,
 * nên tổng diện tích luôn bằng diện tích tấm.
 */
export function meshedNodeAreas(corners: readonly (P3 & { id: string })[], candidates: readonly (P3 & { id: string })[], tol: number): Map<string, number> {
  const n = corners.length;
  const out = new Map<string, number>();
  const cornerIds = new Set(corners.map((c) => c.id));
  // Pháp tuyến (Newell) và trục chiếu: bỏ thành phần lớn nhất của pháp tuyến.
  const nrm: V3 = [0, 0, 0];
  corners.forEach((p, k) => {
    const q = corners[(k + 1) % n]!;
    nrm[0] += (p.y - q.y) * (p.z + q.z);
    nrm[1] += (p.z - q.z) * (p.x + q.x);
    nrm[2] += (p.x - q.x) * (p.y + q.y);
  });
  const nl = Math.hypot(...nrm);
  const unit = nrm.map((v) => v / nl) as V3;
  const drop = unit.map(Math.abs).indexOf(Math.max(...unit.map(Math.abs)));
  const uv = (p: P3): [number, number] => (drop === 0 ? [p.y, p.z] : drop === 1 ? [p.z, p.x] : [p.x, p.y]);
  const scale = 1 / Math.abs(unit[drop]!); // diện tích 3D = diện tích chiếu × scale
  const o = corners[0]!;
  const planeDist = (p: P3) => Math.abs((p.x - o.x) * unit[0] + (p.y - o.y) * unit[1] + (p.z - o.z) * unit[2]);
  const nodes: (P3 & { id: string })[] = [...corners];
  const P = () => nodes.map(uv);
  const cross2 = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const poly = corners.map(uv);
  const signedArea = poly.reduce((s, p, k) => s + (p[0] * poly[(k + 1) % n]![1] - poly[(k + 1) % n]![0] * p[1]), 0) / 2;
  const orient = Math.sign(signedArea) || 1;
  const eps = 1e-9 * Math.max(1, Math.abs(signedArea));
  const inside = (q: [number, number]) => {
    let wind = false;
    for (let k = 0; k < n; k++) {
      const a = poly[k]!, b = poly[(k + 1) % n]!;
      // Trên cạnh: tính là bên trong.
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (len * len);
      if (t >= 0 && t <= 1 && Math.abs(cross2(a, b, q)) / len <= tol) return true;
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) wind = !wind;
    }
    return wind;
  };
  const interior = candidates.filter((c) => !cornerIds.has(c.id) && planeDist(c) <= tol && inside(uv(c)));
  if (!interior.length) {
    cornerAreas(corners).forEach((a, k) => out.set(corners[k]!.id, (out.get(corners[k]!.id) ?? 0) + a));
    return out;
  }
  const convex = poly.every((p, k) => orient * cross2(p, poly[(k + 1) % n]!, poly[(k + 2) % n]!) >= -eps);
  let tris: [number, number, number][] = [];
  let rest = interior;
  if (convex) {
    const first = interior[0]!;
    nodes.push(first);
    const f = nodes.length - 1;
    for (let k = 0; k < n; k++) tris.push([f, k, (k + 1) % n]);
    rest = interior.slice(1);
  } else {
    // Cắt tai.
    const idx = corners.map((_, k) => k);
    while (idx.length > 3) {
      let cut = false;
      for (let k = 0; k < idx.length && !cut; k++) {
        const [i0, i1, i2] = [idx[(k + idx.length - 1) % idx.length]!, idx[k]!, idx[(k + 1) % idx.length]!];
        const [a, b, c] = [poly[i0]!, poly[i1]!, poly[i2]!];
        if (orient * cross2(a, b, c) <= eps) continue;
        const blocked = idx.some((j) => j !== i0 && j !== i1 && j !== i2 &&
          orient * cross2(a, b, poly[j]!) > eps && orient * cross2(b, c, poly[j]!) > eps && orient * cross2(c, a, poly[j]!) > eps);
        if (blocked) continue;
        tris.push([i0, i1, i2]);
        idx.splice(k, 1);
        cut = true;
      }
      if (!cut) break;
    }
    if (idx.length === 3) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  }
  for (const c of rest) {
    nodes.push(c);
    const ci = nodes.length - 1;
    const pts = P();
    const q = pts[ci]!;
    const next: [number, number, number][] = [];
    for (const t of tris) {
      const [a, b, cc] = t.map((i) => pts[i]!) as [[number, number], [number, number], [number, number]];
      const area = cross2(a, b, cc);
      const w = [cross2(b, cc, q) / area, cross2(cc, a, q) / area, cross2(a, b, q) / area];
      if (w.some((x) => x < -1e-9)) {
        next.push(t);
        continue;
      }
      for (const s of [[t[0], t[1], ci], [t[1], t[2], ci], [t[2], t[0], ci]] as [number, number, number][]) {
        if (Math.abs(cross2(pts[s[0]]!, pts[s[1]]!, pts[s[2]]!)) > eps) next.push(s);
      }
    }
    tris = next;
  }
  const pts = P();
  for (const t of tris) {
    const a = (Math.abs(cross2(pts[t[0]]!, pts[t[1]]!, pts[t[2]]!)) / 2) * scale;
    for (const i of t) out.set(nodes[i]!.id, (out.get(nodes[i]!.id) ?? 0) + a / 3);
  }
  return out;
}

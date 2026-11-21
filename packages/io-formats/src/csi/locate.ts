import { loadOnSegment, type Frame, type FrameLoad, type Joint } from "@nexfem/model-core";

/**
 * Tìm chỗ đặt tải tập trung theo toạ độ cho điểm CSI không phải đầu thanh/sàn nào đã nhập.
 * ETABS/SAP2000 tự chia thanh tại điểm nằm trên thanh (auto mesh), nên tải ở điểm đó truyền vào thanh.
 * - Trùng một nút đã có (trong dung sai): đặt tải lên nút đó.
 * - Nằm trong đoạn một thanh: trả về thanh và vị trí tương đối; lực tại đó tương đương chính xác với tải tập trung trên thanh.
 * `uniqueFrameTol` yêu cầu một thanh duy nhất trong dung sai cho trục thanh, vẫn dùng `tol` cho nút đã nối.
 */
export function locatePoint(
  p: { x: number; y: number; z: number },
  joints: readonly Joint[],
  frames: readonly Frame[],
  tol: number,
  uniqueFrameTol?: number,
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
    if (!(dist <= (uniqueFrameTol ?? tol))) continue;
    if (best && uniqueFrameTol !== undefined) return null;
    if (!best || dist < best.dist) best = { frame: f, at: t, dist };
  }
  return best ? { frame: best.frame, at: uniqueFrameTol === undefined ? Number(best.at.toPrecision(12)) : best.at } : null;
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
 * Các nút trong `jointsByHost` chỉ chia thanh được chỉ định, ví dụ nút tạo từ tải.
 * Thanh được chia nhận nhãn "B6-1", "B6-2"…; thanh không chia giữ nguyên.
 */
export function splitFramesAtJoints(
  frames: readonly Frame[],
  joints: readonly Joint[],
  extraNodes: Iterable<string>,
  canSplit: (f: Frame) => boolean,
  tol: number,
  jointsByHost?: ReadonlyMap<string, readonly Joint[]>,
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
    const hostJoints = jointsByHost?.get(f.id);
    for (const p of hostJoints ? [...cand, ...hostJoints] : cand) {
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

/**
 * Chuyển tải của thanh gốc sang các đoạn bằng `loadOnSegment` của model-core (dùng chung với lệnh chia thanh):
 * tải đều chép cho mọi đoạn; tải tập trung vào đoạn chứa vị trí; tải `linear` cắt theo đoạn và nội suy cường độ.
 */
export function remapFrameLoads(loads: readonly FrameLoad[], segments: ReadonlyMap<string, FrameSegment[]>): FrameLoad[] {
  const out: FrameLoad[] = [];
  for (const l of loads) {
    const segs = segments.get(l.frame);
    if (!segs) {
      out.push(l);
      continue;
    }
    if (l.kind === "point") {
      // Điểm ngoài mọi đoạn (sai số làm tròn): đoạn cuối, như trước.
      const at = l.at ?? 0.5;
      const s = segs.find((x) => at >= x.t0 - 1e-12 && at <= x.t1 + 1e-12) ?? segs[segs.length - 1]!;
      const part = loadOnSegment({ ...l, at: Math.min(s.t1, Math.max(s.t0, at)) }, s.t0, s.t1)!;
      out.push({ ...part, id: l.id, frame: s.id, at: Number(part.at!.toPrecision(12)) });
      continue;
    }
    segs.forEach((s, k) => {
      const part = loadOnSegment(l, s.t0, s.t1);
      if (part) out.push({ ...part, id: `${l.id}-${k + 1}`, frame: s.id });
    });
  }
  return out;
}

/**
 * Diện tích chịu tải của các nút trên một tấm phẳng khi chia tấm tại các nút nằm bên trong nó, như ETABS/SAP2000
 * tự chia sàn khi phân tích (ví dụ chân cột đặt giữa tấm móng). Chỉ nhận nút cách mặt phẳng tấm không quá `tol`
 * và nằm trong đa giác (kể cả trên cạnh); nút lệch mặt phẳng (ví dụ đỉnh cột phía trên) không bị ghép.
 * Không có nút bên trong: giữ đúng `cornerAreas`. Có nút bên trong: chia tam giác (quạt từ nút bên trong đầu tiên
 * với tấm lồi, cắt tai với tấm lõm, rồi chèn các nút còn lại) và mỗi tam giác chia đều 1/3 diện tích cho ba đỉnh,
 * nên tổng diện tích luôn bằng diện tích tấm. Trả null nếu không chia được một lưới hợp lệ.
 */
export function meshedNodeAreas(corners: readonly (P3 & { id: string })[], candidates: readonly (P3 & { id: string })[], tol: number): Map<string, number> | null {
  const n = corners.length;
  if (n < 3) return null;
  const cornerIds = new Set(corners.map((c) => c.id));
  const o = corners[0]!;
  // Pháp tuyến (Newell) và trục chiếu: bỏ thành phần lớn nhất của pháp tuyến.
  const nrm: V3 = [0, 0, 0];
  corners.forEach((p, k) => {
    const q = corners[(k + 1) % n]!;
    nrm[0] += (p.y - q.y) * ((p.z - o.z) + (q.z - o.z));
    nrm[1] += (p.z - q.z) * ((p.x - o.x) + (q.x - o.x));
    nrm[2] += (p.x - q.x) * ((p.y - o.y) + (q.y - o.y));
  });
  const nl = Math.hypot(...nrm);
  if (!Number.isFinite(nl) || nl === 0) return null;
  const unit = nrm.map((v) => v / nl) as V3;
  const drop = unit.map(Math.abs).indexOf(Math.max(...unit.map(Math.abs)));
  const uv = (p: P3): [number, number] => (drop === 0 ? [p.y - o.y, p.z - o.z] : drop === 1 ? [p.z - o.z, p.x - o.x] : [p.x - o.x, p.y - o.y]);
  const scale = 1 / Math.abs(unit[drop]!); // diện tích 3D = diện tích chiếu × scale
  const planeDist = (p: P3) => Math.abs((p.x - o.x) * unit[0] + (p.y - o.y) * unit[1] + (p.z - o.z) * unit[2]);
  if (corners.some((p) => planeDist(p) > tol)) return null;
  const ids = corners.map((p) => p.id);
  const cross2 = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const poly = corners.map(uv);
  const points = [...poly];
  const signedArea = poly.reduce((s, p, k) => s + (p[0] * poly[(k + 1) % n]![1] - poly[(k + 1) % n]![0] * p[1]), 0) / 2;
  const orient = Math.sign(signedArea);
  const span = Math.max(...poly.map(([x, y]) => Math.hypot(x, y)));
  const eps = 64 * Number.EPSILON * span ** 2;
  if (Math.abs(signedArea) <= eps) return null;
  const samePoint = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) <= 64 * Number.EPSILON * span;
  const inside = (q: [number, number]) => {
    let wind = false;
    for (let k = 0; k < n; k++) {
      const a = poly[k]!, b = poly[(k + 1) % n]!;
      // MERGETOL chỉ dùng theo phương pháp tuyến. Mép tấm dùng sai số số học.
      const onSegment = (q[0] - a[0]) * (q[0] - b[0]) + (q[1] - a[1]) * (q[1] - b[1]) <= 0;
      if (onSegment && Math.abs(cross2(a, b, q)) <= eps) return true;
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) wind = !wind;
    }
    return wind;
  };
  const interior = candidates.filter((c) => !cornerIds.has(c.id) && planeDist(c) <= tol)
    .map((c) => ({ id: c.id, xy: uv(c) }))
    .filter(({ xy }) => inside(xy) && poly.every((p) => !samePoint(p, xy)))
    .sort((a, b) => a.xy[0] - b.xy[0] || a.xy[1] - b.xy[1] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!interior.length) {
    const out = new Map<string, number>();
    cornerAreas(corners).forEach((area, k) => out.set(ids[k]!, (out.get(ids[k]!) ?? 0) + area));
    return out;
  }
  const convex = poly.every((p, k) => orient * cross2(p, poly[(k + 1) % n]!, poly[(k + 2) % n]!) >= -eps);
  let tris: [number, number, number][] = [];
  let rest = interior;
  if (convex) {
    const first = interior[0]!;
    const f = points.push(first.xy) - 1;
    ids.push(first.id);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      if (orient * cross2(first.xy, poly[k]!, poly[j]!) > eps) tris.push([f, k, j]);
    }
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
          orient * cross2(a, b, poly[j]!) >= -eps && orient * cross2(b, c, poly[j]!) >= -eps && orient * cross2(c, a, poly[j]!) >= -eps);
        if (blocked) continue;
        tris.push([i0, i1, i2]);
        idx.splice(k, 1);
        cut = true;
      }
      if (!cut) return null;
    }
    if (idx.length === 3) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  }
  for (const { id, xy: q } of rest) {
    if (points.some((p) => samePoint(p, q))) continue;
    const ci = points.push(q) - 1;
    ids.push(id);
    const next: [number, number, number][] = [];
    let inserted = false;
    for (const t of tris) {
      const [i, j, k] = t;
      const [a, b, c] = [points[i]!, points[j]!, points[k]!];
      const [ab, bc, ca] = [orient * cross2(a, b, q), orient * cross2(b, c, q), orient * cross2(c, a, q)];
      if (Math.min(ab, bc, ca) < -eps) {
        next.push(t);
        continue;
      }
      if (ab > eps) next.push([i, j, ci]);
      if (bc > eps) next.push([j, k, ci]);
      if (ca > eps) next.push([k, i, ci]);
      inserted = true;
    }
    if (!inserted) return null;
    tris = next;
  }
  const out = new Map<string, number>();
  let total = 0;
  for (const t of tris) {
    const a = orient * cross2(points[t[0]]!, points[t[1]]!, points[t[2]]!) / 2;
    if (a <= 0) return null;
    total += a;
    for (const i of t) out.set(ids[i]!, (out.get(ids[i]!) ?? 0) + a * scale / 3);
  }
  return Math.abs(total - Math.abs(signedArea)) <= Math.max(eps * tris.length, Math.abs(signedArea) * 1e-10) ? out : null;
}

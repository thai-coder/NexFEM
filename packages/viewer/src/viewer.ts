import type { Model } from "@nexfem/model-core";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { TOL, findGridLine, segmentIntersectsRect, visibleObjects, type ViewSpec, type VisibleSet } from "./filter.ts";

export interface ViewerTheme {
  background: string;
  grid: string;
  gridLabel: string;
  gridLabelBg: string;
  column: string;
  beam: string;
  brace: string;
  slab: string;
  wall: string;
  joint: string;
  support: string;
  selection: string;
  hover: string;
  axisX: string;
  axisY: string;
  axisZ: string;
}

export const DARK_THEME: ViewerTheme = {
  background: "#1e1f22",
  grid: "#4a4d52",
  gridLabel: "#d7dade",
  gridLabelBg: "#2b2d31",
  column: "#e8a33d",
  beam: "#4c9aff",
  brace: "#b07cff",
  slab: "#7fd18b",
  wall: "#3cc7bb",
  joint: "#9aa2ad",
  support: "#ff6b6b",
  selection: "#ffd400",
  hover: "#ffffff",
  axisX: "#ff6b6b",
  axisY: "#7fd18b",
  axisZ: "#6aa6ff",
};

export const LIGHT_THEME: ViewerTheme = {
  background: "#ffffff",
  grid: "#c4c9d1",
  gridLabel: "#2a2f37",
  gridLabelBg: "#f3f4f6",
  column: "#c46b0a",
  beam: "#1f63d6",
  brace: "#7a3fd0",
  slab: "#3d8b2f",
  wall: "#0f8f86",
  joint: "#6b7280",
  support: "#d33a2c",
  selection: "#e0a800",
  hover: "#111827",
  axisX: "#d33a2c",
  axisY: "#2f8a3a",
  axisZ: "#1f63d6",
};

export interface HoverInfo {
  id: string;
  kind: "frame" | "shell" | "joint";
  /** Vị trí con trỏ trong khung nhìn (px). */
  x: number;
  y: number;
}

export interface ViewerCallbacks {
  /** Người dùng chọn đối tượng. `mode`: thay thế, thêm/bớt (Ctrl+click). */
  onSelect?(ids: string[], mode: "replace" | "toggle" | "add"): void;
  onHover?(info: HoverInfo | null): void;
  /** Toạ độ con trỏ trên mặt phẳng khung nhìn (m), null khi ra ngoài. */
  onCursor?(p: [number, number, number] | null): void;
}

const SEL_RECT_STYLE =
  "position:absolute;pointer-events:none;border:1px solid;display:none;z-index:2;";

/**
 * Bộ vẽ mô hình kết cấu cho một khung nhìn (Plan, Elevation hoặc 3D).
 * Không phụ thuộc React: giao diện tạo một đối tượng cho mỗi ô viewport.
 */
export class StructureViewer {
  readonly container: HTMLElement;
  #renderer: THREE.WebGLRenderer;
  #labels: CSS2DRenderer;
  #scene = new THREE.Scene();
  #content = new THREE.Group();
  #overlay = new THREE.Group();
  #persp: THREE.PerspectiveCamera;
  #ortho: THREE.OrthographicCamera;
  #camera: THREE.Camera;
  #controls: OrbitControls;
  #raycaster = new THREE.Raycaster();
  #triad: HTMLCanvasElement;
  #selRect: HTMLDivElement;
  #resizeObs: ResizeObserver;
  #frame = 0;
  #disposed = false;

  #model: Model | null = null;
  #view: ViewSpec = { kind: "3d" };
  #visible: VisibleSet | null = null;
  #theme: ViewerTheme = DARK_THEME;
  #selection = new Set<string>();
  #hover: string | null = null;
  #cb: ViewerCallbacks;

  // bảng tra từ chỉ số hình học → id đối tượng
  #frameLines: LineSegments2 | null = null;
  #frameIds: string[] = [];
  #shellMesh: THREE.Mesh | null = null;
  #shellTriIds: string[] = [];
  #jointPoints: THREE.Points | null = null;
  #jointIds: string[] = [];
  #markPoints: THREE.Points | null = null;
  #markIds: string[] = [];
  #lineMaterials: LineMaterial[] = [];
  #orthoHalfHeight = 10;

  constructor(container: HTMLElement, callbacks: ViewerCallbacks = {}) {
    this.container = container;
    this.#cb = callbacks;
    container.style.position ||= "relative";
    container.style.overflow = "hidden";

    this.#renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.domElement.style.display = "block";
    this.#renderer.domElement.style.touchAction = "none";
    container.appendChild(this.#renderer.domElement);

    this.#labels = new CSS2DRenderer();
    Object.assign(this.#labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.appendChild(this.#labels.domElement);

    this.#triad = document.createElement("canvas");
    Object.assign(this.#triad.style, { position: "absolute", left: "8px", bottom: "8px", width: "64px", height: "64px", pointerEvents: "none" });
    this.#triad.width = 128;
    this.#triad.height = 128;
    container.appendChild(this.#triad);

    this.#selRect = document.createElement("div");
    this.#selRect.style.cssText = SEL_RECT_STYLE;
    container.appendChild(this.#selRect);

    this.#persp = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
    this.#persp.up.set(0, 0, 1);
    this.#ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -5000, 5000);
    this.#camera = this.#persp;

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.zoomToCursor = true;
    this.#controls.enableDamping = false;
    this.#controls.addEventListener("change", () => this.invalidate());
    this.#setupCamera();

    this.#scene.add(this.#content, this.#overlay);
    this.#scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.#bindPointer();
    this.#resizeObs = new ResizeObserver(() => this.resize());
    this.#resizeObs.observe(container);
    this.resize();
  }

  // ---------------------------------------------------------------- public API

  setModel(model: Model): void {
    const first = this.#model === null;
    this.#model = model;
    this.#rebuild();
    if (first) this.zoomExtents();
  }

  setView(view: ViewSpec): void {
    const changed = JSON.stringify(view) !== JSON.stringify(this.#view);
    const kindChanged = view.kind !== this.#view.kind;
    this.#view = view;
    if (kindChanged || this.#camera === this.#persp !== (view.kind === "3d")) this.#setupCamera();
    if (changed) {
      this.#rebuild();
      this.zoomExtents();
    }
  }

  setSelection(ids: Iterable<string>): void {
    this.#selection = new Set(ids);
    this.#buildOverlay();
  }

  setTheme(theme: ViewerTheme): void {
    this.#theme = theme;
    this.#rebuild();
  }

  zoomExtents(): void {
    const box = this.#contentBox();
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const { width, height } = this.#size();
    const aspect = width / Math.max(height, 1);

    if (this.#view.kind === "3d") {
      const radius = Math.max(size.length() / 2, 1);
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.#persp.fov / 2)) / Math.min(1, aspect) * 0.9;
      const dir = new THREE.Vector3(1, -1.25, 0.8).normalize();
      this.#persp.position.copy(center).addScaledVector(dir, dist);
      this.#controls.target.copy(center);
      this.#persp.near = dist / 100;
      this.#persp.far = dist * 100;
      this.#persp.updateProjectionMatrix();
    } else {
      const plane = this.#visible?.plane;
      let w: number;
      let h: number;
      if (plane?.axis === "z") [w, h] = [size.x, size.y];
      else if (plane?.axis === "x") [w, h] = [size.y, size.z];
      else [w, h] = [size.x, size.z];
      this.#orthoHalfHeight = Math.max(h / 2, w / 2 / aspect, 1) * 1.15;
      this.#ortho.zoom = 1;
      this.#placeOrtho(center);
    }
    this.#controls.update();
    this.#applyFrustum();
    this.invalidate();
  }

  resize(): void {
    const { width, height } = this.#size();
    if (width === 0 || height === 0) return;
    this.#renderer.setSize(width, height, false);
    this.#renderer.domElement.style.width = `${width}px`;
    this.#renderer.domElement.style.height = `${height}px`;
    this.#labels.setSize(width, height);
    this.#persp.aspect = width / height;
    this.#persp.updateProjectionMatrix();
    for (const m of this.#lineMaterials) m.resolution.set(width, height);
    this.#applyFrustum();
    this.invalidate();
  }

  /** Lên lịch vẽ lại ở khung hình kế tiếp. */
  invalidate(): void {
    if (this.#frame || this.#disposed) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#render();
    });
  }

  /** Vẽ ngay (dùng cho kiểm thử, chụp ảnh). */
  renderNow(): void {
    this.#render();
  }

  dispose(): void {
    this.#disposed = true;
    cancelAnimationFrame(this.#frame);
    this.#resizeObs.disconnect();
    this.#controls.dispose();
    this.#clear(this.#content);
    this.#clear(this.#overlay);
    this.#renderer.dispose();
    this.container.replaceChildren();
  }

  // ---------------------------------------------------------------- camera

  #size() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  #setupCamera(): void {
    const is3d = this.#view.kind === "3d";
    this.#camera = is3d ? this.#persp : this.#ortho;
    this.#controls.object = this.#camera;
    this.#controls.enableRotate = true;
    // Chuột giữa: pan (Shift + chuột giữa: xoay ở 3D). Chuột phải: xoay ở 3D. Chuột trái dành cho chọn.
    this.#controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: is3d ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE),
    };
    this.#controls.enableRotate = is3d;
    this.#controls.screenSpacePanning = true;
    this.#controls.touches = { ONE: is3d ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  }

  #placeOrtho(center: THREE.Vector3): void {
    const plane = this.#visible?.plane;
    const D = 1000;
    const cam = this.#ortho;
    if (plane?.axis === "z") {
      cam.up.set(0, 1, 0);
      cam.position.set(center.x, center.y, plane.value + D);
      this.#controls.target.set(center.x, center.y, plane.value);
    } else if (plane?.axis === "x") {
      cam.up.set(0, 0, 1);
      cam.position.set(plane.value + D, center.y, center.z);
      this.#controls.target.set(plane.value, center.y, center.z);
    } else {
      const y = plane?.value ?? center.y;
      cam.up.set(0, 0, 1);
      cam.position.set(center.x, y - D, center.z);
      this.#controls.target.set(center.x, y, center.z);
    }
    cam.lookAt(this.#controls.target);
  }

  #applyFrustum(): void {
    const { width, height } = this.#size();
    const aspect = width / Math.max(height, 1);
    const h = this.#orthoHalfHeight;
    this.#ortho.left = -h * aspect;
    this.#ortho.right = h * aspect;
    this.#ortho.top = h;
    this.#ortho.bottom = -h;
    this.#ortho.updateProjectionMatrix();
  }

  #contentBox(): THREE.Box3 {
    const box = new THREE.Box3();
    const m = this.#model;
    const vis = this.#visible;
    if (!m || !vis) return box;
    const v = new THREE.Vector3();
    for (const j of vis.joints) box.expandByPoint(v.set(j.x, j.y, j.z));
    // Lưới trục cũng nằm trong khung.
    const z = vis.plane?.axis === "z" ? vis.plane.value : 0;
    for (const g of m.grids) {
      for (const x of g.x) for (const y of g.y) {
        if (vis.plane?.axis === "x" && Math.abs(x.coord - vis.plane.value) > TOL) continue;
        if (vis.plane?.axis === "y" && Math.abs(y.coord - vis.plane.value) > TOL) continue;
        box.expandByPoint(v.set(x.coord, y.coord, z));
      }
    }
    // Chừa chỗ cho bong bóng tên trục ở mép lưới.
    if (!box.isEmpty() && vis.plane) {
      const pad = 2.6;
      if (vis.plane.axis === "z") box.expandByVector(new THREE.Vector3(pad, pad, 0));
      // Mặt đứng: thêm chỗ bên trái cho nhãn cao độ tầng.
      else if (vis.plane.axis === "x") box.expandByVector(new THREE.Vector3(0, pad * 2.2, pad));
      else box.expandByVector(new THREE.Vector3(pad * 2.2, 0, pad));
    }
    if (vis.plane && vis.plane.axis !== "z") {
      for (const s of m.stories) {
        const p = vis.plane.axis === "x" ? v.set(vis.plane.value, box.min.y, s.elevation) : v.set(box.min.x, vis.plane.value, s.elevation);
        box.expandByPoint(p);
      }
    }
    return box;
  }

  // ---------------------------------------------------------------- scene build

  #clear(group: THREE.Group): void {
    group.traverse((o) => {
      const any = o as THREE.Mesh;
      any.geometry?.dispose();
      const mat = any.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
      if (o instanceof CSS2DObject) o.element.remove();
    });
    group.clear();
  }

  #lineMaterial(width: number, opts: Partial<ConstructorParameters<typeof LineMaterial>[0]> = {}): LineMaterial {
    const { width: w, height: h } = this.#size();
    const m = new LineMaterial({ linewidth: width, worldUnits: false, ...opts });
    m.resolution.set(w || 1, h || 1);
    this.#lineMaterials.push(m);
    return m;
  }

  #rebuild(): void {
    this.#clear(this.#content);
    this.#lineMaterials = [];
    this.#renderer.setClearColor(this.#theme.background);
    this.#selRect.style.borderColor = this.#theme.selection;
    this.#selRect.style.background = `${this.#theme.selection}22`;
    const m = this.#model;
    if (!m) return this.invalidate();
    const vis = visibleObjects(m, this.#view);
    this.#visible = vis;
    const joints = new Map(m.joints.map((j) => [j.id, j]));
    const t = this.#theme;
    const color = new THREE.Color();

    this.#buildGrid(m, vis);

    // Thanh: một LineSegments2 cho tất cả, màu theo loại.
    const pos: number[] = [];
    const col: number[] = [];
    this.#frameIds = [];
    for (const f of vis.frames) {
      const a = joints.get(f.i);
      const b = joints.get(f.j);
      if (!a || !b) continue;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      color.set(f.kind === "column" ? t.column : f.kind === "beam" ? t.beam : t.brace);
      col.push(color.r, color.g, color.b, color.r, color.g, color.b);
      this.#frameIds.push(f.id);
    }
    this.#frameLines = null;
    if (pos.length) {
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      g.setColors(col);
      this.#frameLines = new LineSegments2(g, this.#lineMaterial(2, { vertexColors: true }));
      this.#frameLines.renderOrder = 2;
      this.#content.add(this.#frameLines);
    }

    // Sàn, vách: tam giác hoá theo quạt, trong suốt.
    const sp: number[] = [];
    const sc: number[] = [];
    const edges: number[] = [];
    this.#shellTriIds = [];
    for (const s of vis.shells) {
      const pts = s.joints.map((id) => joints.get(id)).filter((j) => j !== undefined);
      if (pts.length < 3) continue;
      color.set(s.kind === "wall" ? t.wall : t.slab);
      for (let k = 1; k + 1 < pts.length; k++) {
        for (const p of [pts[0]!, pts[k]!, pts[k + 1]!]) {
          sp.push(p.x, p.y, p.z);
          sc.push(color.r, color.g, color.b);
        }
        this.#shellTriIds.push(s.id);
      }
      pts.forEach((p, k) => {
        const q = pts[(k + 1) % pts.length]!;
        edges.push(p.x, p.y, p.z, q.x, q.y, q.z);
      });
    }
    this.#shellMesh = null;
    if (sp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
      const mat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: this.#view.kind === "3d" ? 0.22 : 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.#shellMesh = new THREE.Mesh(g, mat);
      this.#shellMesh.renderOrder = 1;
      this.#content.add(this.#shellMesh);
      const eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
      const el = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: t.slab, transparent: true, opacity: 0.35 }));
      this.#content.add(el);
    }

    // Nút và gối.
    const jp: number[] = [];
    const supports: number[] = [];
    this.#jointIds = [];
    for (const j of vis.joints) {
      jp.push(j.x, j.y, j.z);
      this.#jointIds.push(j.id);
      if (j.restraint?.some(Boolean)) supports.push(j.x, j.y, j.z);
    }
    this.#jointPoints = null;
    if (jp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(jp, 3));
      this.#jointPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: t.joint, size: 3.5, sizeAttenuation: false }));
      this.#jointPoints.renderOrder = 3;
      this.#content.add(this.#jointPoints);
    }
    if (supports.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(supports, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: t.support, size: 8, sizeAttenuation: false, map: triangleSprite(), alphaTest: 0.5 }));
      pts.renderOrder = 4;
      this.#content.add(pts);
    }

    // Cột cắt qua mặt bằng: ô vuông.
    const mp: number[] = [];
    this.#markIds = [];
    for (const f of vis.columnMarks) {
      const top = joints.get(f.j);
      if (!top) continue;
      mp.push(top.x, top.y, top.z);
      this.#markIds.push(f.id);
    }
    this.#markPoints = null;
    if (mp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(mp, 3));
      this.#markPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: t.column, size: 11, sizeAttenuation: false }));
      this.#markPoints.renderOrder = 3;
      this.#content.add(this.#markPoints);
    }

    this.#buildOverlay();
  }

  #label(text: string, at: THREE.Vector3, kind: "bubble" | "story"): void {
    const t = this.#theme;
    const el = document.createElement("div");
    el.textContent = text;
    el.className = `nx-label nx-label-${kind}`;
    const base = `font:600 11px/1 Inter,system-ui,sans-serif;color:${t.gridLabel};background:${t.gridLabelBg};border:1px solid ${t.grid};white-space:nowrap;`;
    el.style.cssText =
      kind === "bubble"
        ? `${base}min-width:20px;height:20px;padding:0 4px;border-radius:10px;display:flex;align-items:center;justify-content:center;`
        : `${base}padding:3px 6px;border-radius:4px;font-weight:500;`;
    const obj = new CSS2DObject(el);
    obj.position.copy(at);
    if (kind === "story") obj.center.set(1.1, 0.5);
    this.#content.add(obj);
  }

  #buildGrid(m: Model, vis: VisibleSet): void {
    const t = this.#theme;
    const pos: number[] = [];
    const plane = vis.plane;
    const ext = 1.5; // trục kéo dài ra ngoài lưới (m)
    const z0 = plane?.axis === "z" ? plane.value : 0;
    const zMax = Math.max(0, ...m.stories.map((s) => s.elevation));
    const labelOff = ext + 0.6;

    for (const g of m.grids) {
      if (!g.x.length || !g.y.length) continue;
      const xMin = Math.min(...g.x.map((l) => l.coord));
      const xMax = Math.max(...g.x.map((l) => l.coord));
      const yMin = Math.min(...g.y.map((l) => l.coord));
      const yMax = Math.max(...g.y.map((l) => l.coord));

      if (!plane || plane.axis === "z") {
        for (const l of g.x) {
          pos.push(l.coord, yMin - ext, z0, l.coord, yMax + ext, z0);
          this.#label(l.label, new THREE.Vector3(l.coord, yMax + labelOff, z0), "bubble");
          if (plane) this.#label(l.label, new THREE.Vector3(l.coord, yMin - labelOff, z0), "bubble");
        }
        for (const l of g.y) {
          pos.push(xMin - ext, l.coord, z0, xMax + ext, l.coord, z0);
          this.#label(l.label, new THREE.Vector3(xMin - labelOff, l.coord, z0), "bubble");
          if (plane) this.#label(l.label, new THREE.Vector3(xMax + labelOff, l.coord, z0), "bubble");
        }
      } else {
        // Mặt đứng: trục đứng theo phương còn lại + đường cao độ tầng.
        const lines = plane.axis === "x" ? g.y : g.x;
        const lo = plane.axis === "x" ? yMin : xMin;
        const hi = plane.axis === "x" ? yMax : xMax;
        const P = (u: number, z: number) =>
          plane.axis === "x" ? new THREE.Vector3(plane.value, u, z) : new THREE.Vector3(u, plane.value, z);
        for (const l of lines) {
          const a = P(l.coord, -ext);
          const b = P(l.coord, zMax + ext);
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          this.#label(l.label, P(l.coord, -labelOff), "bubble");
        }
        for (const s of m.stories) {
          const a = P(lo - ext, s.elevation);
          const b = P(hi + ext, s.elevation);
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          this.#label(`${s.name}  ${s.elevation.toFixed(2)}`, P(lo - ext - 0.3, s.elevation), "story");
        }
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineDashedMaterial({ color: t.grid, dashSize: 0.6, gapSize: 0.25, transparent: true, opacity: 0.9 }),
    );
    lines.computeLineDistances();
    this.#content.add(lines);
  }

  /** Lớp tô sáng: đối tượng đang chọn (vàng) và đang rê chuột. */
  #buildOverlay(): void {
    this.#clear(this.#overlay);
    const m = this.#model;
    const vis = this.#visible;
    if (!m || !vis) return this.invalidate();
    const joints = new Map(m.joints.map((j) => [j.id, j]));
    const t = this.#theme;

    const addFrames = (ids: Set<string>, colorHex: string, width: number, dashed: boolean) => {
      const pos: number[] = [];
      for (const f of vis.frames) {
        if (!ids.has(f.id)) continue;
        const a = joints.get(f.i);
        const b = joints.get(f.j);
        if (a && b) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      for (const s of vis.shells) {
        if (!ids.has(s.id)) continue;
        s.joints.forEach((id, k) => {
          const a = joints.get(id);
          const b = joints.get(s.joints[(k + 1) % s.joints.length]!);
          if (a && b) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        });
      }
      if (!pos.length) return;
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      const mat = this.#lineMaterial(width, { color: new THREE.Color(colorHex).getHex(), dashed, dashSize: 6, gapSize: 4, depthTest: false });
      const l = new LineSegments2(g, mat);
      if (dashed) {
        l.computeLineDistances();
        mat.dashScale = 1;
        mat.worldUnits = false;
      }
      l.renderOrder = 10;
      this.#overlay.add(l);
    };

    if (this.#hover && !this.#selection.has(this.#hover)) addFrames(new Set([this.#hover]), t.hover, 3, false);
    addFrames(this.#selection, t.selection, 3.5, false);

    const selJoints: number[] = [];
    for (const id of this.#selection) {
      const j = joints.get(id);
      if (j) selJoints.push(j.x, j.y, j.z);
    }
    for (const f of vis.columnMarks) {
      if (!this.#selection.has(f.id)) continue;
      const j = joints.get(f.j);
      if (j) selJoints.push(j.x, j.y, j.z);
    }
    if (selJoints.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(selJoints, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: t.selection, size: 9, sizeAttenuation: false, depthTest: false }));
      p.renderOrder = 11;
      this.#overlay.add(p);
    }
    this.invalidate();
  }

  // ---------------------------------------------------------------- render

  #render(): void {
    const { width, height } = this.#size();
    if (!width || !height) return;
    this.#renderer.render(this.#scene, this.#camera);
    this.#labels.render(this.#scene, this.#camera);
    this.#drawTriad();
  }

  #drawTriad(): void {
    const ctx = this.#triad.getContext("2d");
    if (!ctx) return;
    const t = this.#theme;
    ctx.clearRect(0, 0, 128, 128);
    const q = this.#camera.quaternion.clone().invert();
    const axes: [string, THREE.Vector3, string][] = [
      ["X", new THREE.Vector3(1, 0, 0), t.axisX],
      ["Y", new THREE.Vector3(0, 1, 0), t.axisY],
      ["Z", new THREE.Vector3(0, 0, 1), t.axisZ],
    ];
    const projected = axes
      .map(([n, v, c]) => [n, v.applyQuaternion(q), c] as const)
      .sort((a, b) => a[1].z - b[1].z);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.font = "600 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [n, v, c] of projected) {
      const len = Math.hypot(v.x, v.y);
      if (len < 0.15) {
        ctx.fillStyle = c;
        ctx.fillText(n, 64, 64);
        continue;
      }
      const x = 64 + v.x * 40;
      const y = 64 - v.y * 40;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillText(n, 64 + v.x * 54, 64 - v.y * 54);
    }
  }

  // ---------------------------------------------------------------- picking

  #ndc(ev: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.#renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  #worldPerPixel(): number {
    const { height } = this.#size();
    if (this.#camera === this.#ortho) return (2 * this.#orthoHalfHeight) / this.#ortho.zoom / Math.max(height, 1);
    const d = this.#persp.position.distanceTo(this.#controls.target);
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(this.#persp.fov / 2))) / Math.max(height, 1);
  }

  /** Chiếu điểm toạ độ mô hình (m) ra toạ độ màn hình tương đối với khung nhìn (px). */
  worldToScreen(x: number, y: number, z: number): [number, number] {
    const { width, height } = this.#size();
    const v = new THREE.Vector3(x, y, z).project(this.#camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }

  /** Đối tượng dưới con trỏ, ưu tiên nút → thanh → sàn. */
  pickAt(clientX: number, clientY: number): HoverInfo | null {
    const ndc = this.#ndc({ clientX, clientY });
    const rc = this.#raycaster;
    rc.setFromCamera(ndc, this.#camera);
    rc.params.Points = { threshold: this.#worldPerPixel() * 6 };
    (rc.params as { Line2?: { threshold: number } }).Line2 = { threshold: 6 };
    const r = this.#renderer.domElement.getBoundingClientRect();
    const at = { x: clientX - r.left, y: clientY - r.top };

    const hitPoints = (obj: THREE.Points | null, ids: string[], kind: HoverInfo["kind"]) => {
      if (!obj) return null;
      const hit = rc.intersectObject(obj)[0];
      return hit && hit.index != null ? { id: ids[hit.index]!, kind, ...at } : null;
    };
    const mark = hitPoints(this.#markPoints, this.#markIds, "frame");
    if (mark) return mark;
    const joint = hitPoints(this.#jointPoints, this.#jointIds, "joint");
    if (joint) return joint;
    if (this.#frameLines) {
      const hit = rc.intersectObject(this.#frameLines)[0];
      if (hit && hit.faceIndex != null) return { id: this.#frameIds[hit.faceIndex]!, kind: "frame", ...at };
    }
    if (this.#shellMesh) {
      const hit = rc.intersectObject(this.#shellMesh)[0];
      if (hit && hit.faceIndex != null) return { id: this.#shellTriIds[hit.faceIndex]!, kind: "shell", ...at };
    }
    return null;
  }

  /** Chọn theo khung: kéo trái → phải chọn đối tượng nằm trọn; phải → trái chọn cả đối tượng bị cắt. */
  pickRect(x0: number, y0: number, x1: number, y1: number, crossing: boolean): string[] {
    const m = this.#model;
    const vis = this.#visible;
    if (!m || !vis) return [];
    const { width, height } = this.#size();
    const joints = new Map(m.joints.map((j) => [j.id, j]));
    const v = new THREE.Vector3();
    const toScreen = (id: string): [number, number] | null => {
      const j = joints.get(id);
      if (!j) return null;
      v.set(j.x, j.y, j.z).project(this.#camera);
      return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
    };
    const rect = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
    const inside = (p: [number, number]) => p[0] >= rect.x0 && p[0] <= rect.x1 && p[1] >= rect.y0 && p[1] <= rect.y1;
    const out: string[] = [];
    const test = (pts: ([number, number] | null)[], closed: boolean) => {
      if (pts.some((p) => p === null)) return false;
      const ps = pts as [number, number][];
      if (!crossing) return ps.every(inside);
      for (let k = 0; k < ps.length - (closed ? 0 : 1); k++) {
        if (segmentIntersectsRect(ps[k]!, ps[(k + 1) % ps.length]!, rect)) return true;
      }
      return false;
    };
    for (const f of vis.frames) if (test([toScreen(f.i), toScreen(f.j)], false)) out.push(f.id);
    for (const f of vis.columnMarks) {
      const p = toScreen(f.j);
      if (p && inside(p)) out.push(f.id);
    }
    for (const s of vis.shells) if (test(s.joints.map(toScreen), true)) out.push(s.id);
    return out;
  }

  #cursorPoint(ev: PointerEvent): [number, number, number] | null {
    const plane = this.#visible?.plane;
    const rc = this.#raycaster;
    rc.setFromCamera(this.#ndc(ev), this.#camera);
    const normal = plane?.axis === "x" ? new THREE.Vector3(1, 0, 0) : plane?.axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    const p = new THREE.Plane(normal, -(plane?.value ?? 0));
    const hit = rc.ray.intersectPlane(p, new THREE.Vector3());
    return hit ? [hit.x, hit.y, hit.z] : null;
  }

  #bindPointer(): void {
    const el = this.#renderer.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    let hoverFrame = 0;
    let lastMove: PointerEvent | null = null;

    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const r = el.getBoundingClientRect();
      down = { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId };
      dragging = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      if (down) {
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (!dragging && Math.hypot(x - down.x, y - down.y) > 4) dragging = true;
        if (dragging) {
          const crossing = x < down.x;
          Object.assign(this.#selRect.style, {
            display: "block",
            left: `${Math.min(x, down.x)}px`,
            top: `${Math.min(y, down.y)}px`,
            width: `${Math.abs(x - down.x)}px`,
            height: `${Math.abs(y - down.y)}px`,
            borderStyle: crossing ? "dashed" : "solid",
          });
        }
        return;
      }
      lastMove = e;
      if (hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!lastMove || this.#disposed) return;
        const info = this.pickAt(lastMove.clientX, lastMove.clientY);
        const id = info?.id ?? null;
        if (id !== this.#hover) {
          this.#hover = id;
          this.#buildOverlay();
        }
        el.style.cursor = id ? "pointer" : "default";
        this.#cb.onHover?.(info);
        this.#cb.onCursor?.(this.#cursorPoint(lastMove));
      });
    });
    el.addEventListener("pointerleave", () => {
      if (this.#hover) {
        this.#hover = null;
        this.#buildOverlay();
      }
      this.#cb.onHover?.(null);
      this.#cb.onCursor?.(null);
    });
    el.addEventListener("pointerup", (e) => {
      if (!down || e.pointerId !== down.id) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const additive = e.ctrlKey || e.metaKey;
      if (dragging) {
        this.#selRect.style.display = "none";
        const ids = this.pickRect(down.x, down.y, x, y, x < down.x);
        this.#cb.onSelect?.(ids, additive || e.shiftKey ? "add" : "replace");
      } else {
        const hit = this.pickAt(e.clientX, e.clientY);
        if (hit) this.#cb.onSelect?.([hit.id], additive ? "toggle" : "replace");
        else if (!additive) this.#cb.onSelect?.([], "replace");
      }
      down = null;
      dragging = false;
    });
  }
}

let triTexture: THREE.Texture | null = null;
/** Hình tam giác cho ký hiệu gối. */
function triangleSprite(): THREE.Texture {
  if (triTexture) return triTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(30, 28);
  ctx.lineTo(2, 28);
  ctx.closePath();
  ctx.fill();
  triTexture = new THREE.CanvasTexture(c);
  return triTexture;
}

export { findGridLine };

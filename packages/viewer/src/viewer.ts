import { toDisplay, unitLabel, type Model } from "@nexfem/model-core";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { projectDeformedFrames, type DeformedFrames } from "./deformation.ts";
import { momentDiagramPositions, type MomentDiagram } from "./moment.ts";
import { DEFAULT_DISPLAY, applyDisplayFilter, normalizeDisplay, type DisplayOptions } from "./display.ts";
import { TOL, findGridLine, segmentIntersectsRect, visibleObjects, type ViewSpec, type VisibleSet } from "./filter.ts";
import { gridLines, orthoLock, pickSnap, snapPoints, type GridHit, type P3, type SnapKind, type SnapModes, type SnapPoint } from "./snap.ts";

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
  load: string;
  deformed: string;
  moment: string;
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
  load: "#ff8a3d",
  deformed: "#ff8fd1",
  moment: "#55def0",
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
  load: "#d4570c",
  deformed: "#9e1469",
  moment: "#007886",
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
  /** Chuột phải (không kéo) trên khung nhìn: đối tượng hoặc trục lưới dưới con trỏ. */
  onContextMenu?(info: { clientX: number; clientY: number; hit: HoverInfo | null; grid: GridHit | null }): void;
  /** Bấm đúp vào trục lưới hoặc đường cao độ tầng (không có đối tượng ở đó). */
  onGridDoubleClick?(grid: GridHit): void;
  /** Chế độ vẽ: người dùng bấm một điểm (đã bắt điểm). */
  onPoint?(snap: SnapPoint): void;
  /** Chế độ vẽ: kết thúc chuỗi (chuột phải hoặc bấm đúp). */
  onFinish?(): void;
}

/** Tuỳ chọn hiển thị trên khung nhìn. */
export type { DisplayOptions } from "./display.ts";

/** Loại đối tượng được phép chọn. */
export interface SelectFilter {
  joint: boolean;
  frame: boolean;
  shell: boolean;
}

/** Quá số lượng này thì không hiện nhãn (tránh chậm và rối). */
export const MAX_LABELS = 1500;

export interface DrawingOptions {
  modes: SnapModes;
  /** Các điểm đã bấm của đối tượng đang vẽ, để vẽ đường kéo xem trước. */
  preview: P3[];
  /** Đa giác (sàn): nối điểm hiện tại về điểm đầu. */
  closed?: boolean;
  /** Nhãn hiển thị cạnh dấu bắt điểm, theo loại. */
  labels?: Partial<Record<SnapKind, string>>;
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
  #deformedShape: DeformedFrames | null = null;
  #deformedLine: LineSegments2 | null = null;
  #deformationStart: number | null = null;
  #deformationMotion: { origin: Float32Array; target: Float32Array; buffer: THREE.InterleavedBuffer; progress: number } | null = null;
  #momentDiagram: MomentDiagram | null = null;
  #momentLine: LineSegments2 | null = null;
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

  // chế độ vẽ
  #drawing: DrawingOptions | null = null;
  #loadPattern: string | null = null;
  #display: DisplayOptions = { ...DEFAULT_DISPLAY };
  /** Ký hiệu có kích thước theo mét: to ra khi phóng gần, nhưng luôn đủ lớn để thấy. */
  #symbolMats: { mat: THREE.PointsMaterial; world: number; min: number; max: number }[] = [];
  #filter: SelectFilter = { joint: true, frame: true, shell: true };
  #viewDir = new THREE.Vector3(1, -1.25, 0.8).normalize();
  #pivotEl: HTMLDivElement;
  #snapCache: { points: SnapPoint[]; lines: ReturnType<typeof gridLines> } | null = null;
  #snap: SnapPoint | null = null;
  #snapEl: HTMLDivElement;
  #rubber = new THREE.Group();

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

    this.#pivotEl = document.createElement("div");
    this.#pivotEl.style.cssText =
      "position:absolute;pointer-events:none;display:none;z-index:3;width:14px;height:14px;margin:-9px 0 0 -9px;border:2px solid #ffd400;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.35);";
    container.appendChild(this.#pivotEl);

    this.#snapEl = document.createElement("div");
    this.#snapEl.className = "nx-snap";
    this.#snapEl.style.cssText = "position:absolute;pointer-events:none;display:none;z-index:3;";
    container.appendChild(this.#snapEl);

    this.#persp = new THREE.PerspectiveCamera(45, 1, 0.05, 5000);
    this.#persp.up.set(0, 0, 1);
    this.#ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -5000, 5000);
    this.#camera = this.#persp;

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.zoomToCursor = true;
    this.#controls.enableDamping = false;
    this.#controls.addEventListener("change", () => {
      this.#updateSymbolSizes();
      this.invalidate();
    });
    this.#setupCamera();

    this.#scene.add(this.#content, this.#overlay, this.#rubber);
    this.#scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.#bindPointer();
    this.#resizeObs = new ResizeObserver(() => this.resize());
    this.#resizeObs.observe(container);
    this.resize();
  }

  // ---------------------------------------------------------------- public API

  setModel(model: Model): void {
    const first = this.#model === null;
    if (model !== this.#model) {
      this.setDeformedShape(null);
      this.setMomentDiagram(null);
    }
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
      this.#updateDeformedLine();
      this.#updateMomentLine();
      this.zoomExtents();
    }
  }

  /**
   * Bật/tắt chế độ vẽ. Khi bật, chuột trái bấm điểm (có bắt điểm) thay vì chọn đối tượng.
   * Chỉ dùng được ở khung nhìn 2D (Plan, Elevation).
   */
  setDrawing(opts: DrawingOptions | null): void {
    const was = !!this.#drawing;
    this.#drawing = opts && this.#visible?.plane ? opts : null;
    this.#snapCache = null;
    if (!this.#drawing) {
      this.#snap = null;
      this.#snapEl.style.display = "none";
      this.#clear(this.#rubber);
      this.invalidate();
    } else this.#updateRubber();
    if (was !== !!this.#drawing) this.#renderer.domElement.style.cursor = this.#drawing ? "crosshair" : "default";
  }

  /** Tuỳ chọn hiển thị của khung nhìn này; khoá thiếu lấy giá trị mặc định. */
  setDisplay(d: Partial<DisplayOptions>): void {
    const next = normalizeDisplay(d);
    if (JSON.stringify(next) === JSON.stringify(this.#display)) return;
    this.#display = next;
    this.#rebuild();
  }

  get display(): DisplayOptions {
    return { ...this.#display };
  }

  setSelectFilter(f: SelectFilter): void {
    this.#filter = f;
  }

  /** Hiện tải của một mẫu tải (mũi tên + giá trị), null để ẩn. */
  setLoadDisplay(pattern: string | null): void {
    if (pattern === this.#loadPattern) return;
    this.#loadPattern = pattern;
    this.#rebuild();
  }

  #updateSymbolSizes(): void {
    if (!this.#symbolMats.length) return;
    const wpp = this.#worldPerPixel();
    if (!(wpp > 0)) return;
    for (const s of this.#symbolMats) s.mat.size = Math.min(s.max, Math.max(s.min, s.world / wpp));
  }

  /** Kích thước (px) hiện tại của các ký hiệu gối và nhả liên kết (cho kiểm thử). */
  get symbolSizes(): number[] {
    return this.#symbolMats.map((s) => s.mat.size);
  }

  /** Vị trí camera và tâm nhìn (cho kiểm thử). */
  get cameraState(): { position: number[]; target: number[] } {
    return { position: this.#camera.position.toArray(), target: this.#controls.target.toArray() };
  }

  /** Điểm bắt hiện tại (chế độ vẽ). */
  get snap(): SnapPoint | null {
    return this.#snap;
  }

  setSelection(ids: Iterable<string>): void {
    this.#selection = new Set(ids);
    this.#buildOverlay();
  }

  setTheme(theme: ViewerTheme): void {
    this.#theme = theme;
    this.#deformedLine?.material.color.set(theme.deformed);
    this.#momentLine?.material.color.set(theme.moment);
    this.#rebuild();
  }

  /** Lớp kết quả riêng, nằm ngoài các đối tượng chọn và bắt điểm. */
  setDeformedShape(shape: DeformedFrames | null, animationStart: number | null = null): void {
    if (shape === this.#deformedShape && animationStart === this.#deformationStart) return;
    this.#deformedShape = shape;
    this.#deformationStart = animationStart;
    this.#updateDeformedLine();
  }

  #updateDeformedLine(): void {
    const previous = this.#deformedLine;
    this.#removeResultLine(previous);
    this.#deformationMotion = null;
    const shape = this.#deformedShape;
    const visible = this.#visible;
    const in3d = this.#view.kind === "3d";
    const positions = shape && visible && (in3d ? shape.positions : projectDeformedFrames(shape, visible));
    const origin = positions && shape && visible && this.#deformationStart !== null
      ? (in3d ? shape.origins : projectDeformedFrames(shape, visible, shape.origins))
      : null;
    const line = this.#addResultLine(origin ? positions?.slice() ?? null : positions, this.#theme.deformed);
    this.#deformedLine = line;
    if (line && positions && origin) {
      const { data: buffer } = line.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
      buffer.setUsage(THREE.DynamicDrawUsage);
      line.frustumCulled = false;
      this.#deformationMotion = { origin, target: positions, buffer, progress: 1 };
    }
    if (previous || line) this.invalidate();
  }

  setMomentDiagram(diagram: MomentDiagram | null): void {
    if (diagram === this.#momentDiagram) return;
    this.#momentDiagram = diagram;
    this.#updateMomentLine();
  }

  #updateMomentLine(): void {
    const previous = this.#momentLine;
    this.#removeResultLine(previous);
    const positions = this.#momentDiagram && this.#visible && momentDiagramPositions(this.#momentDiagram, this.#visible);
    this.#momentLine = this.#addResultLine(positions, this.#theme.moment);
    if (previous || this.#momentLine) this.invalidate();
  }

  #addResultLine(positions: Float32Array | null, color: string): LineSegments2 | null {
    if (!positions?.length) return null;
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    const material = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: 2, depthTest: false, depthWrite: false });
    const { width, height } = this.#size();
    material.resolution.set(width || 1, height || 1);
    const line = new LineSegments2(geometry, material);
    line.renderOrder = 4;
    this.#scene.add(line);
    return line;
  }

  #removeResultLine(line: LineSegments2 | null): void {
    if (!line) return;
    this.#scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
  }

  get hasDeformedShape(): boolean {
    return this.#deformedLine !== null;
  }

  /** Phạm vi hình đã biến dạng, theo toạ độ mô hình. */
  get deformedBounds(): THREE.Box3 | null {
    return this.#deformedLine?.geometry.boundingBox?.clone() ?? null;
  }

  get momentBounds(): THREE.Box3 | null {
    return this.#momentLine?.geometry.boundingBox?.clone() ?? null;
  }

  get deformationAnimationProgress(): number | null {
    return this.#deformationMotion?.progress ?? null;
  }

  zoomExtents(): void {
    this.#zoomTo(this.#viewDir);
  }

  /** Hướng nhìn nhanh cho khung 3D. */
  setViewPreset(preset: "iso" | "top" | "front" | "right"): void {
    const dirs = {
      iso: new THREE.Vector3(1, -1.25, 0.8),
      top: new THREE.Vector3(0, -0.0001, 1),
      front: new THREE.Vector3(0, -1, 0.0001),
      right: new THREE.Vector3(1, 0, 0.0001),
    };
    this.#viewDir = dirs[preset].normalize();
    this.#zoomTo(this.#viewDir);
  }

  /** Đã yêu cầu zoom nhưng khung chứa chưa có kích thước (cửa sổ đang ẩn); làm lại khi có kích thước. */
  #pendingFit: THREE.Vector3 | null = null;

  #zoomTo(viewDir: THREE.Vector3): void {
    const box = this.#contentBox();
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const { width, height } = this.#size();
    if (width === 0 || height === 0) {
      this.#pendingFit = viewDir.clone();
      return;
    }
    this.#pendingFit = null;
    const aspect = width / Math.max(height, 1);

    if (this.#view.kind === "3d") {
      const radius = Math.max(size.length() / 2, 1);
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.#persp.fov / 2)) / Math.min(1, aspect) * 0.9;
      this.#persp.position.copy(center).addScaledVector(viewDir, dist);
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
    this.#deformedLine?.material.resolution.set(width, height);
    this.#momentLine?.material.resolution.set(width, height);
    this.#applyFrustum();
    this.invalidate();
    if (this.#pendingFit) this.#zoomTo(this.#pendingFit);
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
    this.setDeformedShape(null);
    this.setMomentDiagram(null);
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
    // Xoay 3D do viewer tự xử lý (xoay quanh điểm dưới con trỏ), OrbitControls chỉ lo pan và zoom.
    this.#controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: null as unknown as THREE.MOUSE,
    };
    this.#controls.enableRotate = false;
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
    const deformed = this.deformedBounds;
    if (deformed) box.union(deformed);
    const moment = this.momentBounds;
    if (moment) box.union(moment);
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
    // Đối tượng bị ẩn theo tuỳ chọn hiển thị không vẽ, không chọn và không bắt điểm.
    const vis = applyDisplayFilter(visibleObjects(m, this.#view), this.#display);
    this.#visible = vis;
    const joints = new Map(m.joints.map((j) => [j.id, j]));
    const t = this.#theme;
    const color = new THREE.Color();

    if (this.#display.grid) this.#buildGrid(m, vis);

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
        // Tắt tô màu: mặt vẫn có (opacity 0) để bấm chọn sàn/vách được, chỉ còn đường viền.
        opacity: this.#display.fillShells ? (this.#view.kind === "3d" ? 0.22 : 0.14) : 0,
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
    const supports: Record<"fixed" | "pinned" | "other", number[]> = { fixed: [], pinned: [], other: [] };
    this.#jointIds = [];
    for (const j of vis.joints) {
      jp.push(j.x, j.y, j.z);
      this.#jointIds.push(j.id);
      const r = j.restraint;
      if (r?.some(Boolean)) {
        const kind = r.every(Boolean) ? "fixed" : r[0] && r[1] && r[2] && !r[3] && !r[4] && !r[5] ? "pinned" : "other";
        supports[kind].push(j.x, j.y, j.z);
      }
    }
    this.#jointPoints = null;
    if (jp.length && this.#display.joints) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(jp, 3));
      this.#jointPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: t.joint, size: 5, sizeAttenuation: false }));
      this.#jointPoints.renderOrder = 3;
      this.#content.add(this.#jointPoints);
    }
    this.#symbolMats = [];
    for (const kind of ["fixed", "pinned", "other"] as const) {
      if (!supports[kind].length || !this.#display.restraints) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(supports[kind], 3));
      const mat = new THREE.PointsMaterial({ color: t.support, size: 18, sizeAttenuation: false, map: symbolSprite(kind), alphaTest: 0.5, depthTest: false });
      this.#symbolMats.push({ mat, world: 0.8, min: 16, max: 44 });
      const pts = new THREE.Points(g, mat);
      pts.renderOrder = 8;
      this.#content.add(pts);
    }

    // Nhả liên kết: vòng tròn nhỏ gần đầu thanh được nhả mô men.
    const rel: number[] = [];
    for (const f of vis.frames) {
      if (!f.releases) continue;
      const a = joints.get(f.i);
      const b = joints.get(f.j);
      if (!a || !b) continue;
      const at = (u: number) => [a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u];
      if (f.releases.i.some(Boolean)) rel.push(...at(0.08));
      if (f.releases.j.some(Boolean)) rel.push(...at(0.92));
    }
    if (rel.length && this.#display.releases) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(rel, 3));
      const mat = new THREE.PointsMaterial({ color: t.hover, size: 12, sizeAttenuation: false, map: symbolSprite("ring"), alphaTest: 0.5, depthTest: false });
      this.#symbolMats.push({ mat, world: 0.4, min: 11, max: 24 });
      const pts = new THREE.Points(g, mat);
      pts.renderOrder = 7;
      this.#content.add(pts);
    }
    this.#updateSymbolSizes();

    if (this.#loadPattern && this.#display.loads) this.#buildLoads(m, vis, joints);
    this.#buildTags(vis, joints);

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
    this.#snapCache = null;
    if (this.#drawing && !vis.plane) this.setDrawing(null);
  }

  /** Mũi tên tải thanh (phân bố/tập trung) và nhãn giá trị tải sàn của mẫu tải đang hiển thị. */
  #buildLoads(m: Model, vis: VisibleSet, joints: Map<string, Model["joints"][number]>): void {
    const pattern = this.#loadPattern;
    const t = this.#theme;
    const u = m.units;
    const pos: number[] = [];
    const frames = new Map(vis.frames.map((f) => [f.id, f]));
    const loads = m.frameLoads.filter((l) => l.pattern === pattern && frames.has(l.frame));
    const maxQ = Math.max(1e-9, ...loads.filter((l) => l.kind === "distributed").map((l) => Math.abs(l.value)));
    const maxP = Math.max(1e-9, ...loads.filter((l) => l.kind === "point").map((l) => Math.abs(l.value)));
    const dirOf = (dir: string, value: number, axis: THREE.Vector3): THREE.Vector3 => {
      const s = Math.sign(value) || 1;
      switch (dir) {
        case "gravity":
          return new THREE.Vector3(0, 0, -s);
        case "globalX":
          return new THREE.Vector3(s, 0, 0);
        case "globalY":
          return new THREE.Vector3(0, s, 0);
        case "localX":
          return axis.clone().multiplyScalar(s);
        default: {
          // Trục 2 cục bộ: thẳng đứng với thanh ngang, theo X với thanh đứng; trục 3 = 1 × 2.
          const vertical = Math.abs(axis.z) > 0.99;
          const l2 = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).sub(axis.clone().multiplyScalar(axis.z)).normalize();
          const v = dir === "local3" ? axis.clone().cross(l2) : dir === "globalZ" ? new THREE.Vector3(0, 0, 1) : l2;
          return v.multiplyScalar(s);
        }
      }
    };
    // Mũi tên từ "tail" tới "tip" kèm hai nét đầu mũi tên.
    const arrow = (tip: THREE.Vector3, d: THREE.Vector3, len: number) => {
      const tail = tip.clone().addScaledVector(d, -len);
      pos.push(tail.x, tail.y, tail.z, tip.x, tip.y, tip.z);
      const side = Math.abs(d.z) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const h = Math.min(0.18, len * 0.35);
      for (const sgn of [1, -1]) {
        const p = tip.clone().addScaledVector(d, -h).addScaledVector(side, sgn * h * 0.6);
        pos.push(tip.x, tip.y, tip.z, p.x, p.y, p.z);
      }
    };
    for (const l of loads) {
      const f = frames.get(l.frame)!;
      const a = joints.get(f.i);
      const b = joints.get(f.j);
      if (!a || !b) continue;
      const A = new THREE.Vector3(a.x, a.y, a.z);
      const B = new THREE.Vector3(b.x, b.y, b.z);
      const axis = B.clone().sub(A).normalize();
      const d = dirOf(l.direction, l.value, axis);
      if (l.kind === "distributed") {
        const len = 0.35 + 0.65 * (Math.abs(l.value) / maxQ);
        const offA = A.clone().addScaledVector(d, -len);
        const offB = B.clone().addScaledVector(d, -len);
        pos.push(offA.x, offA.y, offA.z, offB.x, offB.y, offB.z);
        for (let k = 0; k <= 5; k++) arrow(A.clone().lerp(B, k / 5), d, len);
        const mid = offA.clone().lerp(offB, 0.5);
        this.#valueLabel(`${toDisplay(l.value, "forcePerLength", u).toFixed(2)}`, mid);
      } else {
        const len = 0.5 + 1.0 * (Math.abs(l.value) / maxP);
        const tip = A.clone().lerp(B, l.at ?? 0.5);
        arrow(tip, d, len);
        this.#valueLabel(`${toDisplay(l.value, "force", u).toFixed(2)} ${unitLabel("force", u)}`, tip.clone().addScaledVector(d, -len - 0.35));
      }
    }
    if (pos.length) {
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      const lines = new LineSegments2(g, this.#lineMaterial(1.5, { color: new THREE.Color(t.load).getHex() }));
      lines.renderOrder = 6;
      this.#content.add(lines);
    }
    const shells = new Map(vis.shells.map((x) => [x.id, x]));
    for (const l of m.shellLoads) {
      if (l.pattern !== pattern) continue;
      const sh = shells.get(l.shell);
      if (!sh) continue;
      const pts = sh.joints.map((id) => joints.get(id)).filter((j) => j !== undefined);
      if (!pts.length) continue;
      const c = new THREE.Vector3();
      for (const p of pts) c.add(new THREE.Vector3(p.x, p.y, p.z));
      c.divideScalar(pts.length);
      this.#valueLabel(`${toDisplay(l.value, "stress", u).toFixed(2)}`, c);
    }
  }

  /** Nhãn nút / nhãn thanh (chỉ khi số lượng không quá MAX_LABELS). */
  #buildTags(vis: VisibleSet, joints: Map<string, Model["joints"][number]>): void {
    const t = this.#theme;
    const tag = (text: string, p: THREE.Vector3, color: string) => {
      const el = document.createElement("div");
      el.textContent = text;
      el.className = "nx-label nx-label-tag";
      el.style.cssText = `font:500 10px/1 Inter,system-ui,sans-serif;color:${color};text-shadow:0 0 2px ${t.background},0 0 2px ${t.background};white-space:nowrap;`;
      const o = new CSS2DObject(el);
      o.position.copy(p);
      o.center.set(-0.25, 1.15);
      this.#content.add(o);
    };
    if (this.#display.jointLabels && this.#display.joints && vis.joints.length <= MAX_LABELS) {
      for (const j of vis.joints) tag(j.label, new THREE.Vector3(j.x, j.y, j.z), t.joint);
    }
    const { frameLabels, sectionNames, shellLabels } = this.#display;
    if ((frameLabels || sectionNames) && vis.frames.length <= MAX_LABELS) {
      const secName = new Map((this.#model?.frameSections ?? []).map((s) => [s.id, s.name]));
      for (const f of vis.frames) {
        const a = joints.get(f.i);
        const b = joints.get(f.j);
        if (!a || !b) continue;
        const text = [frameLabels ? f.label : "", sectionNames ? (secName.get(f.section) ?? "?") : ""].filter(Boolean).join(" · ");
        tag(text, new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), f.kind === "column" ? t.column : f.kind === "beam" ? t.beam : t.brace);
      }
    }
    if (shellLabels && vis.shells.length <= MAX_LABELS) {
      for (const s of vis.shells) {
        const pts = s.joints.map((id) => joints.get(id)).filter((j) => j !== undefined);
        if (!pts.length) continue;
        const c = new THREE.Vector3();
        for (const p of pts) c.add(new THREE.Vector3(p.x, p.y, p.z));
        c.divideScalar(pts.length);
        tag(s.label, c, s.kind === "wall" ? t.wall : t.slab);
      }
    }
  }

  #valueLabel(text: string, at: THREE.Vector3): void {
    const t = this.#theme;
    const el = document.createElement("div");
    el.textContent = text;
    el.className = "nx-label nx-label-load";
    el.style.cssText = `font:600 10px/1 Inter,system-ui,sans-serif;color:${t.load};background:${t.gridLabelBg}cc;padding:1px 3px;border-radius:3px;white-space:nowrap;`;
    const obj = new CSS2DObject(el);
    obj.position.copy(at);
    this.#content.add(obj);
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
    const motion = this.#deformationMotion;
    if (motion && this.#deformationStart !== null) {
      // Lặp giữa hình gốc và kết quả tĩnh, dùng chung mốc thời gian giữa các ô.
      motion.progress = (1 - Math.cos((performance.now() - this.#deformationStart) * 2 * Math.PI / 2400)) / 2;
      const values = motion.buffer.array;
      for (let k = 0; k < values.length; k++) values[k] = motion.origin[k]! + (motion.target[k]! - motion.origin[k]!) * motion.progress;
      motion.buffer.needsUpdate = true;
      this.invalidate();
    }
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

  // ---------------------------------------------------------------- drawing

  #snapAt(ev: { clientX: number; clientY: number; shiftKey: boolean }): SnapPoint | null {
    const d = this.#drawing;
    const m = this.#model;
    const vis = this.#visible;
    if (!d || !m || !vis?.plane) return null;
    const cursor = this.#cursorPoint(ev);
    if (!cursor) return null;
    // Lưới trục đang ẩn thì không bắt điểm vào lưới.
    const modes = this.#display.grid ? d.modes : { ...d.modes, grid: false, gridline: false };
    this.#snapCache ??= { points: snapPoints(m, vis, modes), lines: gridLines(m, vis) };
    const r = this.#renderer.domElement.getBoundingClientRect();
    const px: [number, number] = [ev.clientX - r.left, ev.clientY - r.top];
    let snap = pickSnap(cursor, px, this.#snapCache.points, this.#snapCache.lines, modes, (p) => this.worldToScreen(...p), 12, this.#worldPerPixel());
    const anchor = d.preview.at(-1);
    if (ev.shiftKey && anchor && (snap.kind === "free" || snap.kind === "gridline")) {
      snap = { kind: snap.kind, p: orthoLock(anchor, snap.p, vis.plane.axis) };
    }
    return snap;
  }

  #showSnap(snap: SnapPoint | null): void {
    const el = this.#snapEl;
    const d = this.#drawing;
    if (!snap || !d) {
      el.style.display = "none";
      return;
    }
    const [x, y] = this.worldToScreen(...snap.p);
    const t = this.#theme;
    const shape: Record<SnapKind, string> = {
      joint: "width:11px;height:11px;border:2px solid;",
      grid: "width:12px;height:12px;border:2px solid;border-radius:50%;",
      mid: "width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid;",
      gridline: "width:10px;height:10px;border:2px dotted;border-radius:50%;",
      free: "width:6px;height:6px;border:1px solid;",
    };
    const prefix = d.labels?.[snap.kind] ?? "";
    const text = snap.kind === "free" ? "" : `${prefix}${snap.label ? ` ${snap.label}` : ""}`.trim();
    el.innerHTML = `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);box-sizing:border-box;color:${t.selection};border-color:${t.selection};${shape[snap.kind]}"></div>${
      text
        ? `<div style="position:absolute;left:10px;top:8px;white-space:nowrap;font:500 11px Inter,system-ui,sans-serif;color:${t.gridLabel};background:${t.gridLabelBg};border:1px solid ${t.grid};border-radius:3px;padding:1px 5px;">${text.replace(/[<&>]/g, "")}</div>`
        : ""
    }`;
    Object.assign(el.style, { display: "block", left: `${x}px`, top: `${y}px` });
  }

  #updateRubber(): void {
    this.#clear(this.#rubber);
    const d = this.#drawing;
    if (!d) return this.invalidate();
    const pts = [...d.preview];
    if (this.#snap) pts.push(this.#snap.p);
    if (d.closed && pts.length >= 3) pts.push(pts[0]!);
    if (pts.length >= 2) {
      const pos: number[] = [];
      for (let k = 0; k + 1 < pts.length; k++) pos.push(...pts[k]!, ...pts[k + 1]!);
      const g = new LineSegmentsGeometry();
      g.setPositions(pos);
      const l = new LineSegments2(g, this.#lineMaterial(2.5, { color: new THREE.Color(this.#theme.selection).getHex(), depthTest: false }));
      l.renderOrder = 20;
      this.#rubber.add(l);
    }
    if (d.preview.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(d.preview.flat(), 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: this.#theme.selection, size: 7, sizeAttenuation: false, depthTest: false }));
      p.renderOrder = 21;
      this.#rubber.add(p);
    }
    this.invalidate();
  }

  // ---------------------------------------------------------------- orbit 3D

  /** Tâm xoay: điểm phần tử dưới con trỏ → tâm các đối tượng đang chọn → tâm hiện tại. */
  #pivotAt(ev: { clientX: number; clientY: number }): THREE.Vector3 {
    const rc = this.#raycaster;
    rc.setFromCamera(this.#ndc(ev), this.#camera);
    rc.params.Points = { threshold: this.#worldPerPixel() * 6 };
    (rc.params as { Line2?: { threshold: number } }).Line2 = { threshold: 6 };
    const targets = [this.#jointPoints, this.#frameLines, this.#shellMesh].filter((o): o is NonNullable<typeof o> => !!o);
    const hits = rc.intersectObjects(targets, false).sort((a, b) => a.distance - b.distance);
    if (hits[0]) return hits[0].point.clone();
    const m = this.#model;
    if (m && this.#selection.size) {
      const box = new THREE.Box3();
      const joints = new Map(m.joints.map((j) => [j.id, j]));
      const add = (id: string) => {
        const j = joints.get(id);
        if (j) box.expandByPoint(new THREE.Vector3(j.x, j.y, j.z));
      };
      for (const f of m.frames) if (this.#selection.has(f.id)) (add(f.i), add(f.j));
      for (const s of m.shells) if (this.#selection.has(s.id)) s.joints.forEach(add);
      for (const id of this.#selection) add(id);
      if (!box.isEmpty()) return box.getCenter(new THREE.Vector3());
    }
    return this.#controls.target.clone();
  }

  #orbit(pivot: THREE.Vector3, dx: number, dy: number): void {
    const cam = this.#persp;
    const speed = 0.006;
    const Z = new THREE.Vector3(0, 0, 1);
    const forward = this.#controls.target.clone().sub(cam.position).normalize();
    const right = forward.clone().cross(Z).normalize();
    const qYaw = new THREE.Quaternion().setFromAxisAngle(Z, -dx * speed);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * speed);
    const apply = (q: THREE.Quaternion) => {
      const pos = cam.position.clone().sub(pivot).applyQuaternion(q).add(pivot);
      const tgt = this.#controls.target.clone().sub(pivot).applyQuaternion(q).add(pivot);
      return { pos, tgt };
    };
    let r = apply(qYaw.clone().multiply(qPitch));
    // Không cho lật qua đỉnh/đáy: khi gần thẳng đứng thì chỉ xoay ngang.
    if (Math.abs(r.tgt.clone().sub(r.pos).normalize().z) > 0.995) r = apply(qYaw);
    cam.position.copy(r.pos);
    this.#controls.target.copy(r.tgt);
    cam.lookAt(r.tgt);
    this.#controls.update();
    this.#showPivot(pivot);
    this.invalidate();
  }

  #showPivot(p: THREE.Vector3 | null): void {
    if (!p) {
      this.#pivotEl.style.display = "none";
      return;
    }
    const [x, y] = this.worldToScreen(p.x, p.y, p.z);
    Object.assign(this.#pivotEl.style, { display: "block", left: `${x}px`, top: `${y}px` });
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
    const f = this.#filter;
    const mark = f.frame ? hitPoints(this.#markPoints, this.#markIds, "frame") : null;
    if (mark) return mark;
    const joint = f.joint ? hitPoints(this.#jointPoints, this.#jointIds, "joint") : null;
    if (joint) return joint;
    if (this.#frameLines && f.frame) {
      const hit = rc.intersectObject(this.#frameLines)[0];
      if (hit && hit.faceIndex != null) return { id: this.#frameIds[hit.faceIndex]!, kind: "frame", ...at };
    }
    if (this.#shellMesh && f.shell) {
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
    const flt = this.#filter;
    if (flt.frame) {
      for (const f of vis.frames) if (test([toScreen(f.i), toScreen(f.j)], false)) out.push(f.id);
      for (const f of vis.columnMarks) {
        const p = toScreen(f.j);
        if (p && inside(p)) out.push(f.id);
      }
    }
    if (flt.shell) for (const s of vis.shells) if (test(s.joints.map(toScreen), true)) out.push(s.id);
    if (flt.joint && this.#display.joints) {
      for (const j of vis.joints) {
        const p = toScreen(j.id);
        if (p && inside(p)) out.push(j.id);
      }
    }
    return out;
  }

  /** Trục lưới / đường cao độ tầng gần con trỏ nhất (trong 8 px), chỉ ở khung nhìn 2D. */
  #gridAt(ev: { clientX: number; clientY: number }): GridHit | null {
    const m = this.#model;
    const vis = this.#visible;
    if (!m || !vis?.plane || !this.#display.grid) return null;
    const r = this.#renderer.domElement.getBoundingClientRect();
    const c: [number, number] = [ev.clientX - r.left, ev.clientY - r.top];
    let best: GridHit | null = null;
    let bestD = 8;
    for (const l of gridLines(m, vis)) {
      const a = this.worldToScreen(...l.o);
      const b = this.worldToScreen(l.o[0] + l.d[0], l.o[1] + l.d[1], l.o[2] + l.d[2]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) continue;
      const d = Math.abs((b[0] - a[0]) * (a[1] - c[1]) - (a[0] - c[0]) * (b[1] - a[1])) / len;
      if (d < bestD) {
        bestD = d;
        best = { kind: l.kind, id: l.id, label: l.label };
      }
    }
    return best;
  }

  #cursorPoint(ev: { clientX: number; clientY: number }): [number, number, number] | null {
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

    // Xoay 3D: chuột phải kéo, hoặc Shift + chuột giữa kéo.
    let suppressMenu = false;
    let orbit: { pivot: THREE.Vector3; x: number; y: number; id: number; moved: boolean } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if (this.#view.kind !== "3d" || this.#drawing) return;
      if (!(e.button === 2 || (e.button === 1 && e.shiftKey))) return;
      orbit = { pivot: this.#pivotAt(e), x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      el.setPointerCapture(e.pointerId);
      this.#showPivot(orbit.pivot);
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!orbit || e.pointerId !== orbit.id) return;
      const dx = e.clientX - orbit.x;
      const dy = e.clientY - orbit.y;
      if (!dx && !dy) return;
      orbit.x = e.clientX;
      orbit.y = e.clientY;
      orbit.moved = true;
      this.#orbit(orbit.pivot, dx, dy);
    });
    const endOrbit = (e: PointerEvent) => {
      if (!orbit || e.pointerId !== orbit.id) return;
      suppressMenu = orbit.moved;
      orbit = null;
      this.#showPivot(null);
    };
    el.addEventListener("pointerup", endOrbit);
    el.addEventListener("pointercancel", endOrbit);

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.#drawing) return this.#cb.onFinish?.();
      // Sau khi kéo xoay 3D bằng chuột phải thì không hiện menu.
      if (suppressMenu) {
        suppressMenu = false;
        return;
      }
      const hit = this.pickAt(e.clientX, e.clientY);
      this.#cb.onContextMenu?.({ clientX: e.clientX, clientY: e.clientY, hit, grid: hit ? null : this.#gridAt(e) });
    });
    el.addEventListener("dblclick", (e) => {
      if (this.#drawing) return this.#cb.onFinish?.();
      if (this.pickAt(e.clientX, e.clientY)) return;
      const grid = this.#gridAt(e);
      if (grid) this.#cb.onGridDoubleClick?.(grid);
    });
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
        if (dragging && !this.#drawing) {
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
        if (this.#drawing) {
          this.#snap = this.#snapAt(lastMove);
          this.#showSnap(this.#snap);
          this.#updateRubber();
          this.#cb.onCursor?.(this.#snap?.p ?? null);
          return;
        }
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
      if (this.#drawing) {
        this.#snap = null;
        this.#showSnap(null);
        this.#updateRubber();
      }
    });
    el.addEventListener("pointerup", (e) => {
      if (!down || e.pointerId !== down.id) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const additive = e.ctrlKey || e.metaKey;
      if (this.#drawing) {
        if (!dragging) {
          const snap = this.#snapAt(e);
          if (snap) this.#cb.onPoint?.(snap);
        }
        this.#selRect.style.display = "none";
        down = null;
        dragging = false;
        return;
      }
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

const sprites = new Map<string, THREE.Texture>();
/** Ký hiệu: gối ngàm (vuông), khớp (tam giác), gối khác (tròn), nhả liên kết (vòng tròn rỗng). */
function symbolSprite(kind: "fixed" | "pinned" | "other" | "ring"): THREE.Texture {
  const hit = sprites.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (kind === "fixed") ctx.rect(5, 5, 22, 22);
  else if (kind === "pinned") {
    ctx.moveTo(16, 4);
    ctx.lineTo(30, 28);
    ctx.lineTo(2, 28);
    ctx.closePath();
  } else ctx.arc(16, 16, kind === "ring" ? 11 : 12, 0, Math.PI * 2);
  if (kind === "ring") ctx.stroke();
  else ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  sprites.set(kind, tex);
  return tex;
}

export { findGridLine };

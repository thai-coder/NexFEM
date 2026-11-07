import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { MODEL_SCHEMA_VERSION, parseModel, type Model } from "./schema.ts";

/**
 * File dự án `.nxf`: một file zip gồm
 *  - `manifest.json`: định dạng, phiên bản, ứng dụng tạo file;
 *  - `model.json`: mô hình (theo schema/model.schema.json).
 * Kết quả phân tích (Giai đoạn 5+) sẽ thêm vào thư mục `results/` trong cùng file.
 */
export const PROJECT_FORMAT = "nexfem-project";
export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_EXTENSION = "nxf";

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  app: string;
  savedAt: string;
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

export function serializeProject(model: Model, app = "NexFEM"): Uint8Array {
  const manifest: ProjectManifest = {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    schemaVersion: MODEL_SCHEMA_VERSION,
    app,
    savedAt: new Date().toISOString(),
  };
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      "model.json": strToU8(JSON.stringify(model)),
    },
    { level: 6 },
  );
}

/** Đọc file `.nxf` (zip) hoặc file JSON mô hình trần. */
export function parseProject(bytes: Uint8Array): { model: Model; manifest?: ProjectManifest } {
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  let modelText: string;
  let manifest: ProjectManifest | undefined;
  if (isZip) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new ProjectError("File .nxf bị hỏng (không giải nén được)");
    }
    const m = files["manifest.json"];
    const body = files["model.json"];
    if (!m || !body) throw new ProjectError("File .nxf thiếu manifest.json hoặc model.json");
    manifest = JSON.parse(strFromU8(m)) as ProjectManifest;
    if (manifest.format !== PROJECT_FORMAT) throw new ProjectError("Không phải file dự án NexFEM");
    if (manifest.formatVersion > PROJECT_FORMAT_VERSION) {
      throw new ProjectError(`File được tạo bởi phiên bản NexFEM mới hơn (định dạng ${manifest.formatVersion})`);
    }
    modelText = strFromU8(body);
  } else {
    modelText = strFromU8(bytes);
  }
  let data: unknown;
  try {
    data = JSON.parse(modelText);
  } catch {
    throw new ProjectError("Nội dung mô hình không phải JSON hợp lệ");
  }
  try {
    return { model: parseModel(data), ...(manifest ? { manifest } : {}) };
  } catch (e) {
    throw new ProjectError(`Mô hình không hợp lệ: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }
}

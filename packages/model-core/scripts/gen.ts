// Sinh các file dùng chung giữa TypeScript và Rust:
//  - packages/model-core/schema/model.schema.json (JSON Schema của file mô hình)
//  - resources/templates/sample-frame.json (mô hình mẫu, dùng trong test của crates/fem-core)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatedFiles } from "../src/generated.ts";

for (const [rel, content] of Object.entries(generatedFiles())) {
  const path = fileURLToPath(new URL(`../${rel}`, import.meta.url));
  writeFileSync(path, content);
  console.log("wrote", rel);
}

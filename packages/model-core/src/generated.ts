import { z } from "zod";
import { ModelSchema } from "./schema.ts";
import { sampleModel } from "./templates.ts";

/** Nội dung các file sinh tự động, khoá là đường dẫn tương đối từ packages/model-core. */
export function generatedFiles(): Record<string, string> {
  const schema = z.toJSONSchema(ModelSchema, { target: "draft-2020-12", io: "input" });
  return {
    "schema/model.schema.json": JSON.stringify({ title: "NexFEM model", ...schema }, null, 2) + "\n",
    "../../resources/templates/sample-frame.json": JSON.stringify(sampleModel(), null, 2) + "\n",
  };
}

import type { CsiImportResult } from "@nexfem/io-formats";

/**
 * An incomplete CSI import must not enter the model used for analysis. The decision comes from io-formats
 * (`report.blocked`); this only adds that the file must be a text export whose units were read.
 */
export function csiImportPolicy(result: Pick<CsiImportResult, "format"> & { report: Pick<CsiImportResult["report"], "units" | "blocked"> }) {
  const readable = (result.format === "e2k" || result.format === "s2k") && result.report.units != null;
  const hasImportErrors = result.report.blocked;
  return { readable, hasImportErrors, canOpen: readable && !hasImportErrors };
}

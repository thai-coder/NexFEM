/** An incomplete CSI import must not enter the model used for analysis. */
export function csiImportPolicy(format: string, units: unknown, diagnostics: readonly { level: string }[]) {
  const readable = (format === "e2k" || format === "s2k") && units != null;
  const hasImportErrors = diagnostics.some((d) => d.level === "error");
  return { readable, hasImportErrors, canOpen: readable && !hasImportErrors };
}

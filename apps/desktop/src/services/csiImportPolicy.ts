/** An incomplete CSI import must not enter the model used for analysis. */
export function csiImportPolicy(format: string, units: unknown, blocked: boolean) {
  const readable = (format === "e2k" || format === "s2k") && units != null;
  const hasImportErrors = blocked;
  return { readable, hasImportErrors, canOpen: readable && !hasImportErrors };
}

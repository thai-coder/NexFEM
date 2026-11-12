import { useT } from "../i18n/index.ts";
import type { CaseResult } from "../services/solver.ts";
import { selectActiveCase, useResults } from "../stores/results.ts";

export function ResultCaseSelect({ testId, className }: { testId: string; className?: string }) {
  const T = useT();
  const cases = useResults((s) => s.results?.cases);
  const current = useResults(selectActiveCase);
  const selectCase = useResults((s) => s.selectCase);
  if (!cases || !current) return null;

  const label = (c: CaseResult) => `${c.name} · ${T.analysis.caseKinds[c.kind]}`;
  return (
    <select
      aria-label={T.analysis.case}
      title={label(current)}
      className={className}
      data-testid={testId}
      value={current.id}
      onChange={(event) => selectCase(event.target.value)}
    >
      {cases.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
    </select>
  );
}

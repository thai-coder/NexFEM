import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareNormalized } from "./compare-csi.mjs";

const reference = () => ({
  source: { program: "Analytical benchmark (not ETABS)", version: "1" },
  units: { force: "kN", length: "m" },
  metrics: [
    { case: "DL", kind: "displacement", object: "J2", component: "U3", value: -0.01, absTolerance: 0.0001, relTolerance: 0.005 },
  ],
});
const actual = (value = -0.01) => ({
  units: { force: "kN", length: "m" },
  metrics: [{ case: "DL", kind: "displacement", object: "J2", component: "U3", value }],
});

describe("CSI comparison harness (synthetic inputs only)", () => {
  it("passes within individually declared tolerances", () => {
    const result = compareNormalized(reference(), actual(-0.01004));
    assert.equal(result.passed, true);
    assert.equal(result.totals.pass, 1);
  });
  it("fails outside tolerances (never auto-adjusts thresholds)", () => {
    const result = compareNormalized(reference(), actual(-0.012));
    assert.equal(result.passed, false);
    assert.equal(result.totals.fail, 1);
  });
  it("fails missing or extra result metrics", () => {
    assert.equal(compareNormalized(reference(), { ...actual(), metrics: [] }).totals.missing, 1);
    assert.equal(compareNormalized(reference(), { ...actual(), metrics: [...actual().metrics, { ...actual().metrics[0], object: "J3" }] }).totals.unexpected, 1);
  });
  it("rejects unnormalized unit systems and absent tolerances", () => {
    assert.throws(() => compareNormalized(reference(), { ...actual(), units: { force: "lb", length: "in" } }), /Units mismatch/);
    const r = reference();
    delete r.metrics[0].absTolerance;
    assert.throws(() => compareNormalized(r, actual()), /tolerance/);
  });
});

"""Independently inspect single-line SAP uniform area records against an imported model.

Usage: python sap-check-uniform.py source.s2k imported-result.json
Input JSON is a temporary {model, report} produced by importS2k, not a SAP result.
This focused check accepts only GLOBAL/Gravity, kip and in; it fails on other forms.
It does not verify mesh, solver behavior, or the provenance of output tables.
"""
import collections
import json
import math
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit("Usage: python sap-check-uniform.py source.s2k imported-result.json")
with open(sys.argv[1], encoding="utf-8") as f:
    raw = f.read()
with open(sys.argv[2], encoding="utf-8") as f:
    model = json.load(f)["model"]

def rows(name):
    pattern = r'(?ms)^TABLE:\s+"' + re.escape(name) + r'"\s*$(.*?)(?=^TABLE:|^END TABLE DATA)'
    match = re.search(pattern, raw)
    if not match:
        raise ValueError(f"Missing source table: {name}")
    result = []
    for line in match.group(1).splitlines():
        if not line.strip():
            continue
        if line.rstrip().endswith(" _") or line.startswith("        "):
            raise ValueError(f"Unexpected multiline record in {name}")
        values = dict((m.group(1), m.group(3) if m.group(3) is not None else m.group(2))
                      for m in re.finditer(r'(\w+)=("([^"]*)"|\S+)', line))
        if not values:
            raise ValueError(f"Invalid record in {name}")
        result.append(values)
    return result

header = re.search(r'(?ms)^TABLE:\s+"PROGRAM CONTROL"\s*$(.*?)(?=^TABLE:)', raw)
if not header or 'CurrUnits="Kip, in, F"' not in header.group(1):
    raise ValueError("This check requires source units Kip, in, F")
source = collections.defaultdict(list)
target = collections.defaultdict(list)
area = {item["id"]: item["label"] for item in model["shells"]}
patterns = {item["id"]: item["name"] for item in model["loadPatterns"]}
for row in rows("AREA LOADS - UNIFORM"):
    if row.get("CoordSys", "GLOBAL").upper() != "GLOBAL" or row.get("Dir", "").upper() != "GRAVITY":
        raise ValueError("This check only supports GLOBAL/Gravity loads")
    source[(row["Area"], row["LoadPat"])].append(float(row["UnifLoad"]) * 4.4482216152605 / .0254**2)
for load in model["shellLoads"]:
    if load["direction"] != "gravity":
        raise ValueError("Unexpected imported load direction")
    target[(area[load["shell"]], patterns[load["pattern"]])].append(load["value"])
if source.keys() != target.keys() or any(len(vals) != len(target[k]) for k, vals in source.items()):
    raise ValueError("Imported load keys or counts differ")
errors = [abs(a-b) for k in source for a,b in zip(sorted(source[k]), sorted(target[k]))]
if not errors or any(not math.isfinite(e) for e in errors) or max(errors) > 1e-10:
    raise ValueError("Imported loads differ from source")
print(json.dumps({"checked_loads": len(errors), "max_absolute_error_kN_per_m2": max(errors)}))

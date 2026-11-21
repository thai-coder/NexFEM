"""Export pinned SAP2000 result tables to CSV without changing values or units."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from openpyxl import load_workbook

SOURCE = "f2df3ae400910a3a07d693d620133ae0b2fd5924"
TABLES = {
    "Base Reactions": "b956de64066308caf0df4855edf75b5e3d43f0f88519b8618eb962baba3b6be8",
    "Auto Seismic Loads To Joints": "79281a09be2a77b04060a3a49f211641c049fb25b8f36583db3d696483fe4e6d",
    "Joint Displacements": "6884048ba7708f7eddd42210ed43542a5d1a54b42fb839812a2d9e52975ecceb",
    "Joint Reactions": "79133e985c355f289dcbd6596b719e390df4856f9655321f7e4a8dfbe304a38a",
    "Element Forces - Frames": "2c31ea642497cd22a7a3d72c076084cdf737ddaa7242d018a0813c56401d48bb",
    "Objects And Elements - Areas": "7df3d27419c90ca16f5a4b50e376de702c7bc862d67a3a8fb7815d09f3537cea",
}
BASE = ("GlobalFX", "GlobalFY", "GlobalFZ")
CASES = {"DEAD", "LIVE", "EQX", "EQY"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("excel", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = {"sourceCommit": SOURCE, "tables": {}, "staticBaseReactionsKip": {}}

    for name, expected in TABLES.items():
        source = args.excel / f"{name}.xlsx"
        with source.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if actual != expected:
            raise ValueError(f"{source.name}: SHA-256 mismatch; hydrate the pinned Git LFS object")

        workbook = load_workbook(source, read_only=True, data_only=True)
        try:
            sheet = workbook[name]
            rows = iter(sheet.values)
            next(rows)  # Table title
            columns = next(rows)
            units = next(rows)
            counts = {}
            case_column = next((columns.index(key) for key in ("OutputCase", "LoadPat")
                                if key in columns), None)
            csv_name = f"{name.lower().replace(' ', '-').replace('---', '-')}.csv"
            if name == "Base Reactions":
                if any(units[columns.index(key)] != "Kip" for key in BASE):
                    raise ValueError("Base reaction force units must be Kip")
            with (args.out / csv_name).open("w", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream, lineterminator="\n")
                writer.writerow(columns)
                for row in rows:
                    if all(value is None for value in row):
                        continue
                    case = row[case_column] if case_column is not None else "all"
                    counts[case] = counts.get(case, 0) + 1
                    writer.writerow(row)
                    if name == "Base Reactions" and case in CASES:
                        if row[columns.index("CaseType")] != "LinStatic" or case in manifest["staticBaseReactionsKip"]:
                            raise ValueError(f"Expected one linear-static base reaction for {case}")
                        manifest["staticBaseReactionsKip"][case] = dict(zip(
                            BASE, (row[columns.index(key)] for key in BASE)))
            manifest["tables"][name] = {
                "path": f"Analyze.Sap2000/excel/{source.name}", "sha256": actual, "sheet": name,
                "csv": csv_name, "units": dict(zip(columns, units)), "rowsByCase": counts,
            }
        finally:
            workbook.close()

    if manifest["staticBaseReactionsKip"].keys() != CASES:
        raise ValueError("Missing linear-static base reactions")
    (args.out / "reference.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

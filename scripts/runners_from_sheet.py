"""Count runners per cohort from the team's project sheet (xlsx export).

Only counts are written; runner names never leave the spreadsheet.
Usage: python scripts/runners_from_sheet.py project-db.xlsx > data/growth.json
"""
import json
import sys

import openpyxl


def main(path):
    ws = openpyxl.load_workbook(path, data_only=True)["Project DB"]
    by_cohort = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        cohort = int(row[1])
        names = {n.strip() for n in (row[8] or "").split(",") if n.strip()}
        by_cohort.setdefault(cohort, set()).update(names)

    seen, series = set(), []
    for cohort in sorted(by_cohort):
        new = by_cohort[cohort] - seen
        seen |= by_cohort[cohort]
        series.append({"cohort": cohort, "runners": len(by_cohort[cohort]), "new": len(new), "cumulative": len(seen)})
    json.dump({"source": "Project DB", "uniqueRunners": series}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])

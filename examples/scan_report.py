"""Scan a directory with the Python API and print one line per model to replace.

    python examples/scan_report.py            # scans the current directory
    python examples/scan_report.py src
"""

import sys

from model_retire import scan

result = scan(sys.argv[1:] or ["."])
models = {}
for f in result["findings"]:
    m = models.setdefault((f["provider"], f["id"]), dict(f, places=[]))
    m["places"].append("%s:%d" % (f["file"], f["line"]))
for m in sorted(models.values(), key=lambda m: m["days_remaining"] if m["days_remaining"] is not None else 10**9):
    print("%-7s  %s/%s -> %s  [%s]" % (m["severity"], m["provider"], m["id"], m["replacement"] or "(no replacement listed)", ", ".join(m["places"])))
print("%d files scanned, %d models to look at." % (result["files_scanned"], len(models)))
sys.exit(1 if result["summary"]["errors"] else 0)

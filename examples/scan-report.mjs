// Scan a directory with the API and print one line per model to replace,
// soonest shutdown first. Exits 1 if anything is at error level.
//
//   node examples/scan-report.mjs            # scans the current directory
//   node examples/scan-report.mjs src --warn-days 60
import { scan } from '@bydtech/model-retire';

const args = process.argv.slice(2);
const i = args.indexOf('--warn-days');
const warnDays = i === -1 ? 90 : Number(args.splice(i, 2)[1]);

const result = scan({ paths: args.length ? args : ['.'], warnDays });

const byModel = new Map();
for (const f of result.findings) {
  const key = `${f.provider}/${f.id}`;
  const seen = byModel.get(key) ?? { ...f, places: [] };
  seen.places.push(`${f.file}:${f.line}`);
  byModel.set(key, seen);
}
const rows = [...byModel.values()].sort((a, b) => (a.days_remaining ?? Infinity) - (b.days_remaining ?? Infinity));
for (const r of rows) {
  const when = r.days_remaining === null ? 'no date' : r.days_remaining <= 0 ? 'retired' : `${r.days_remaining} days`;
  console.log(`${r.severity.padEnd(7)}  ${when.padEnd(9)}  ${r.provider}/${r.id} -> ${r.replacement ?? '(no replacement listed)'}  [${r.places.join(', ')}]`);
}
console.log(`${result.files_scanned} files scanned, ${rows.length} models to look at.`);
process.exitCode = result.summary.errors > 0 ? 1 : 0;

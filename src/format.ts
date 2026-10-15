import { assess } from './scan.js';
import type { Dataset, Finding, ScanResult } from './types.js';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Plain-language description of where a model is in its lifecycle. */
export function describeTiming(f: Pick<Finding, 'status' | 'retires_on' | 'days_remaining'>): string {
  const d = f.days_remaining;
  if (f.status === 'retired') {
    if (f.retires_on === null || d === null) return 'retired';
    if (d === 0) return `retired ${f.retires_on} (today)`;
    if (d > 0) return `retired (scheduled shutdown ${f.retires_on})`;
    return `retired ${f.retires_on} (${plural(-d, 'day')} ago)`;
  }
  if (f.retires_on === null || d === null) return 'deprecated, no shutdown date announced';
  return `retires ${f.retires_on} (in ${plural(d, 'day')})`;
}

function headline(f: Finding): string {
  const as = f.match === f.id ? '' : ` (as "${f.match}")`;
  return `${f.provider} ${f.id}${as}: ${describeTiming(f)}`;
}

/** Human-readable report grouped by file. */
export function formatText(result: ScanResult): string {
  const lines: string[] = [];
  let current: string | null = null;
  const files = new Set<string>();
  for (const f of result.findings) {
    if (f.file !== current) {
      if (current !== null) lines.push('');
      lines.push(f.file);
      current = f.file;
      files.add(f.file);
    }
    const pos = `${f.line}:${f.column}`;
    const sev = f.severity === 'error' ? 'error  ' : 'warning';
    const lead = `  ${pos.padEnd(8)}${sev}  `;
    const pad = ' '.repeat(lead.length);
    lines.push(`${lead}${headline(f)}`);
    if (f.replacement !== null) lines.push(`${pad}replacement: ${f.replacement}`);
    if (f.note !== null) lines.push(`${pad}note: ${f.note}`);
    if (f.source !== null) lines.push(`${pad}source: ${f.source}`);
  }
  const scanned = `Scanned ${plural(result.files_scanned, 'file')}.`;
  if (result.findings.length === 0) {
    lines.push(`No deprecated or retired model IDs found. ${scanned}`);
  } else {
    const { errors, warnings } = result.summary;
    lines.push('');
    lines.push(
      `${plural(result.findings.length, 'problem')} (${plural(errors, 'error')}, ${plural(warnings, 'warning')}) in ${plural(files.size, 'file')}. ${scanned}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** The scan result as pretty-printed JSON. */
export function formatJson(result: ScanResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** GitHub Actions workflow commands: one `::error` or `::warning` annotation per finding. */
export function formatGithub(result: ScanResult): string {
  const lines = result.findings.map((f) => {
    const title = f.status === 'retired' ? `Retired model ID ${f.id}` : `Deprecated model ID ${f.id}`;
    let message = headline(f) + '.';
    if (f.replacement !== null) message += ` Replacement: ${f.replacement}.`;
    if (f.source !== null) message += ` Source: ${f.source}`;
    const props = `file=${escapeProperty(f.file)},line=${f.line},col=${f.column},title=${escapeProperty(title)}`;
    return `::${f.severity} ${props}::${escapeData(message)}`;
  });
  const { errors, warnings } = result.summary;
  lines.push(
    `model-retire: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}. Scanned ${plural(result.files_scanned, 'file')}.`,
  );
  return `${lines.join('\n')}\n`;
}

/** The dataset as an aligned table, with each model's status on `today`. */
export function formatList(dataset: Dataset, today: string): string {
  const rows: string[][] = [['PROVIDER', 'ID', 'STATUS', 'RETIRES', 'REPLACEMENT']];
  for (const e of dataset.models) {
    const a = assess(e, today, 0, true);
    rows.push([e.provider, e.id, a.status, e.retires_on ?? '-', e.replacement ?? '-']);
  }
  const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  const out = rows.map((r) =>
    r
      .map((cell, i) => (i < 4 ? cell.padEnd(widths[i] as number) : cell))
      .join('  ')
      .trimEnd(),
  );
  const updated = dataset.updated ? ` Data checked ${dataset.updated}.` : '';
  out.push('');
  out.push(`${plural(dataset.models.length, 'model')}.${updated}`);
  return `${out.join('\n')}\n`;
}

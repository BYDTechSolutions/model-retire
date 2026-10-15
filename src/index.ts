/**
 * Find deprecated, retiring and retired LLM model IDs in a codebase.
 *
 * @example
 * ```ts
 * import { scan, formatText } from '@bydtech/model-retire';
 * const result = scan({ paths: ['src'], warnDays: 60 });
 * process.stdout.write(formatText(result));
 * ```
 *
 * @packageDocumentation
 */
export { defaultDataset, loadDatasetFile, mergeDatasets, validateDataset } from './data.js';
export { daysBetween, isValidDate, todayUtc } from './dates.js';
export { describeTiming, formatGithub, formatJson, formatList, formatText } from './format.js';
export { globToRegexSource, parseRule, type GlobRule } from './glob.js';
export { BOUNDARY_CLASS, createMatcher, type LineMatch, type Matcher } from './match.js';
export { assess, DEFAULT_MAX_BYTES, DEFAULT_WARN_DAYS, scan, type Assessment } from './scan.js';
export {
  UsageError,
  type Dataset,
  type Finding,
  type ModelEntry,
  type ScanOptions,
  type ScanResult,
  type Severity,
  type Status,
} from './types.js';
export { LOCKFILES, SKIP_DIRS, walkFiles, type WalkOptions } from './walk.js';

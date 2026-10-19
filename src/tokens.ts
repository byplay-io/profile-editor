import { BUILT_IN_TOKENS, type BuiltInToken, type SlateField } from './schema';

export type TokenGroup = 'slate' | 'time' | 'production' | 'camera' | 'device' | 'custom';

export interface TokenInfo {
  name: string;
  label: string;
  hint: string;
  group: TokenGroup;
}

const BUILT_IN_INFO: Record<BuiltInToken, Omit<TokenInfo, 'name'>> = {
  day: { label: 'Shoot day', hint: 'Shoot day number: 1, 2, 3…', group: 'slate' },
  roll: { label: 'Roll', hint: 'Roll from the slate', group: 'slate' },
  scene: { label: 'Scene', hint: 'Scene from the slate', group: 'slate' },
  take: { label: 'Take', hint: 'Take from the slate', group: 'slate' },
  camera: { label: 'Camera', hint: 'Camera letter from the slate', group: 'slate' },
  date: { label: 'Date', hint: 'Capture date', group: 'time' },
  time: { label: 'Time', hint: 'Capture time', group: 'time' },
  seq: {
    label: 'Counter',
    hint: 'Counts captures in the folder: 1, 2, 3…',
    group: 'time',
  },
  project: { label: 'Project', hint: 'Project code from this profile', group: 'production' },
  title: { label: 'Title', hint: 'Title from this profile', group: 'production' },
  director: { label: 'Director', hint: 'Director from the slate', group: 'production' },
  dp: { label: 'DP', hint: 'DP from the slate', group: 'production' },
  body: { label: 'Camera body', hint: 'Camera body, like Sony Venice 2', group: 'camera' },
  focal: { label: 'Focal length', hint: 'Focal length in mm, number only', group: 'camera' },
  device: { label: 'Device name', hint: "The device's name", group: 'device' },
  mode: { label: 'Mode', hint: 'AR, 3D or Drone', group: 'device' },
};

export const TOKEN_GROUPS: { group: TokenGroup; label: string }[] = [
  { group: 'slate', label: 'Slate' },
  { group: 'time', label: 'Time' },
  { group: 'production', label: 'Production' },
  { group: 'camera', label: 'Camera' },
  { group: 'device', label: 'Device' },
  { group: 'custom', label: 'Custom fields' },
];

export function tokenCatalog(customFields: readonly SlateField[]): TokenInfo[] {
  const builtIns = BUILT_IN_TOKENS.map((name) => ({ name, ...BUILT_IN_INFO[name] }));
  const custom = customFields.map((f) => ({
    name: f.key,
    label: f.label || f.key,
    hint: f.options?.length ? `Pick list: ${f.options.join(', ')}` : 'Custom slate field',
    group: 'custom' as const,
  }));
  return [...builtIns, ...custom];
}

export function isDateToken(name: string) {
  return name === 'date' || name === 'time';
}

export const DEFAULT_DATE_FORMATS: Record<string, string> = { date: 'YYYYMMDD', time: 'HHmm' };

export const DATE_PATTERN_PRESETS: Record<string, string[]> = {
  date: ['YYYYMMDD', 'YYYY-MM-DD', 'YYMMDD', 'DD.MM.YYYY', 'YYYYMMDD_HHmmss'],
  time: ['HHmm', 'HHmmss', 'HH-mm', 'HH.mm.ss'],
};

const DATE_PATTERN_RE = /^(?:YYYY|YY|MM|DD|HH|mm|ss|[-._])+$/;

export function isValidDatePattern(pattern: string) {
  return DATE_PATTERN_RE.test(pattern);
}

/** Zero-padding width from a `0N` format, or null. */
export function padWidth(format: string | undefined): number | null {
  const m = format?.match(/^0(\d)$/);
  return m ? Number(m[1]) : null;
}

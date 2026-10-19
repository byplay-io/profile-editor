// Copied verbatim from byplay-previs-app/src/production/naming.ts by `npm run sync`.
// Do not edit here: change it in the app repo and re-run the sync.

// Capture naming templates. Rules: docs/production-profile.md ("Templates").
//
// Pure TypeScript with no imports — the web profile editor copies this file
// verbatim so its live preview matches what the app writes.

export type TemplateValues = Record<string, string | number | null | undefined>;

export interface TemplateToken {
  name: string;
  format: string | null;
}

export const MAX_FILE_NAME_LENGTH = 150;

const TOKEN_RE = /\{([a-z][a-z0-9]*)(?::([^}]*))?\}/g;
const SEPARATORS = new Set(['_', ' ']);
const DEFAULT_FORMATS: Record<string, string> = {
  date: 'YYYYMMDD',
  time: 'HHmm',
};

export function sanitizeValue(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '-')
      .trim()
      .replace(/^\.+/, '')
  );
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatDate(date: Date, pattern: string): string {
  return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (part) => {
    switch (part) {
      case 'YYYY':
        return date.getFullYear().toString();
      case 'YY':
        return pad2(date.getFullYear() % 100);
      case 'MM':
        return pad2(date.getMonth() + 1);
      case 'DD':
        return pad2(date.getDate());
      case 'HH':
        return pad2(date.getHours());
      case 'mm':
        return pad2(date.getMinutes());
      default:
        return pad2(date.getSeconds());
    }
  });
}

function tokenValue(
  token: TemplateToken,
  values: TemplateValues,
  date: Date,
): string {
  const { name, format } = token;
  if (name === 'date' || name === 'time') {
    return sanitizeValue(formatDate(date, format ?? DEFAULT_FORMATS[name]));
  }
  const raw = values[name];
  if (raw === null || raw === undefined) {
    return '';
  }
  let value = sanitizeValue(String(raw));
  const padMatch = format?.match(/^0(\d)$/);
  if (padMatch && /^\d+$/.test(value)) {
    value = value.padStart(Number(padMatch[1]), '0');
  }
  return value;
}

/** Tokens in a template, in order of appearance. */
export function templateTokens(template: string): TemplateToken[] {
  return Array.from(template.matchAll(TOKEN_RE), (m) => ({
    name: m[1],
    format: m[2] ?? null,
  }));
}

interface Segment {
  text: string;
  hasEmptyToken: boolean;
  // Separator in front of this segment (empty for the first one).
  separator: string;
}

/** Render one folder level or a file name (no '/' handling). */
export function renderLevel(
  template: string,
  values: TemplateValues,
  date: Date,
): string {
  const segments: Segment[] = [];
  let current: Segment = { text: '', hasEmptyToken: false, separator: '' };

  const pushLiteral = (literal: string) => {
    for (const char of literal) {
      if (SEPARATORS.has(char)) {
        segments.push(current);
        current = { text: '', hasEmptyToken: false, separator: char };
      } else {
        current.text += char;
      }
    }
  };

  let lastIndex = 0;
  for (const match of template.matchAll(TOKEN_RE)) {
    pushLiteral(template.slice(lastIndex, match.index));
    const value = tokenValue(
      { name: match[1], format: match[2] ?? null },
      values,
      date,
    );
    if (value === '') {
      current.hasEmptyToken = true;
    }
    current.text += value;
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  pushLiteral(template.slice(lastIndex));
  segments.push(current);

  let result = '';
  for (const segment of segments) {
    const text = segment.text.trim();
    if (segment.hasEmptyToken || text === '') {
      continue;
    }
    result += result === '' ? text : segment.separator + text;
  }
  return sanitizeValue(result).replace(/[. ]+$/, '');
}

/** Folder template → path levels, with empty and dot-only levels removed. */
export function renderFolder(
  template: string,
  values: TemplateValues,
  date: Date,
): string[] {
  return template
    .split('/')
    .map((level) => renderLevel(level, values, date))
    .filter((level) => level !== '' && level !== '.' && level !== '..');
}

export function renderFileName(
  template: string,
  values: TemplateValues,
  date: Date,
): string {
  const name = renderLevel(template.replace(/\//g, '_'), values, date);
  if (name.length <= MAX_FILE_NAME_LENGTH) {
    return name;
  }
  // Cut by code point so an emoji isn't split, then drop what the cut left
  // dangling at the end.
  return Array.from(name)
    .slice(0, MAX_FILE_NAME_LENGTH)
    .join('')
    .replace(/[_ .]+$/, '');
}

/** Token names a template uses that aren't in `known`. */
export function unknownTokens(
  template: string,
  known: readonly string[],
): string[] {
  const knownSet = new Set(known);
  return templateTokens(template)
    .map((t) => t.name)
    .filter((name) => !knownSet.has(name));
}

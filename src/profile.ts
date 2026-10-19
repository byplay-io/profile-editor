import type { z } from 'zod';
import {
  BUILT_IN_TOKENS,
  CaptureSchema,
  DEFAULT_NAMING,
  PROFILE_FORMAT,
  PROFILE_VERSION,
  type ProductionProfile,
  ProductionProfileSchema,
  type ProfileOptics,
  SlateSchema,
} from './schema';

/** The profile being edited. Optics is always present here and dropped on export when empty. */
export type Draft = Omit<ProductionProfile, 'optics'> & { optics: ProfileOptics };

export function emptyOptics(): ProfileOptics {
  return { cameras: [], lenses: [], mattes: [], defaults: {} };
}

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newDraft(): Draft {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    id: uuid(),
    revision: 1,
    updatedAt: new Date().toISOString(),
    project: '',
    title: '',
    naming: structuredClone(DEFAULT_NAMING),
    slate: SlateSchema.parse({}),
    capture: CaptureSchema.parse({}),
    optics: emptyOptics(),
  };
}

export function draftFromProfile(p: ProductionProfile): Draft {
  return { ...structuredClone(p), optics: structuredClone(p.optics) ?? emptyOptics() };
}

function opticsIsEmpty(o: ProfileOptics) {
  const d = o.defaults;
  return (
    o.cameras.length === 0 &&
    o.lenses.length === 0 &&
    o.mattes.length === 0 &&
    d.camera === undefined &&
    d.sensorMode === undefined &&
    d.lens === undefined &&
    d.focalLength === undefined &&
    d.matte === undefined
  );
}

/** The draft as it would be written, before validation: empty kit dropped. */
export function toProfileInput(draft: Draft): unknown {
  const { optics, ...rest } = draft;
  return opticsIsEmpty(optics) ? rest : draft;
}

export type ValidationResult =
  | { ok: true; profile: ProductionProfile }
  | { ok: false; issues: z.core.$ZodIssue[] };

export function validateDraft(draft: Draft): ValidationResult {
  const r = ProductionProfileSchema.safeParse(toProfileInput(draft));
  return r.success ? { ok: true, profile: r.data } : { ok: false, issues: r.error.issues };
}

/** Everything except revision and updatedAt: what "edited" is measured against. */
export function contentKey(profileLike: object): string {
  const { revision: _r, updatedAt: _u, ...rest } = profileLike as Record<string, unknown>;
  return JSON.stringify(rest);
}

export interface RevisionBase {
  revision: number;
  updatedAt: string;
  key: string;
}

/**
 * The profile to write or show as QR codes. A new profile is revision 1; after
 * that, any change since the last export (or since it was opened) bumps the
 * revision by one and stamps updatedAt, so devices replace their copy.
 */
export function exportProfile(
  valid: ProductionProfile,
  base: RevisionBase | null,
  stamp: string,
): ProductionProfile {
  const key = contentKey(valid);
  let revision: number;
  let updatedAt: string;
  if (base === null) {
    revision = valid.revision;
    updatedAt = stamp;
  } else if (base.key === key) {
    revision = base.revision;
    updatedAt = base.updatedAt;
  } else {
    revision = base.revision + 1;
    updatedAt = stamp;
  }
  // Re-parse so the key order is the schema's, whatever order the draft has.
  return ProductionProfileSchema.parse({ ...valid, revision, updatedAt });
}

export function profileJson(p: ProductionProfile) {
  return `${JSON.stringify(p, null, 2)}\n`;
}

export function profileFileName(p: ProductionProfile) {
  const safe = p.project.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '-').replace(/^\.+/, '');
  return `${safe || 'profile'}.bpprod`;
}

// Custom slate field keys.

const RESERVED = new Set<string>(BUILT_IN_TOKENS);

/** A key matching ^[a-z][a-z0-9]{0,23}$, unique, and not a built-in token. */
export function deriveFieldKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!base) base = 'field';
  if (!/^[a-z]/.test(base)) base = `f${base}`;
  base = base.slice(0, 24);
  let key = base;
  for (let n = 2; used.has(key) || RESERVED.has(key); n++) {
    const suffix = String(n);
    key = base.slice(0, 24 - suffix.length) + suffix;
  }
  return key;
}

// Readable validation messages.

const FIELD_LABELS: Record<string, string> = {
  format: 'Format',
  version: 'Format version',
  id: 'Profile ID',
  revision: 'Revision',
  updatedAt: 'Updated at',
  project: 'Project code',
  title: 'Title',
  'naming.snapshot.folder': 'Snapshot folder',
  'naming.snapshot.file': 'Snapshot file name',
  'naming.video.folder': 'Video folder',
  'naming.video.file': 'Video folder name',
  'slate.cameraOptions': 'Camera letters',
  'slate.customFields': 'Custom fields',
  'slate.director': 'Director',
  'slate.dp': 'DP',
  'optics.cameras': 'Cameras',
  'optics.lenses': 'Lenses',
  'optics.mattes': 'Mattes',
};

export function issuePath(issue: { path: PropertyKey[] }) {
  return issue.path.map(String).join('.');
}

export function fieldLabel(path: PropertyKey[], profile?: unknown): string {
  const p = path.map(String);
  const joined = p.join('.');
  if (FIELD_LABELS[joined]) return FIELD_LABELS[joined];
  const [a, b, c, d, e] = p;
  const n = (s: string | undefined) => Number(s) + 1;
  const get = (...keys: string[]) =>
    keys.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), profile);
  if (a === 'slate' && b === 'cameraOptions') return `Camera letter ${n(c)}`;
  if (a === 'slate' && b === 'customFields' && c !== undefined) {
    const label = (get('slate', 'customFields', c, 'label') as string) || `field ${n(c)}`;
    if (d === 'options') return e === undefined ? `“${label}” pick list` : `“${label}” option ${n(e)}`;
    if (d === 'key') return `“${label}” token name`;
    if (d === 'label') return `Custom field ${n(c)} name`;
    return `“${label}”`;
  }
  if (a === 'optics' && (b === 'cameras' || b === 'lenses') && c !== undefined) {
    const item = get('optics', b, c) as { name?: string; family?: string } | undefined;
    const name = b === 'cameras' ? item?.name || `Camera ${n(c)}` : [item?.family, item?.name].filter(Boolean).join(' ') || `Lens set ${n(c)}`;
    const sub: Record<string, string> = {
      name: 'name',
      manufacturer: 'manufacturer',
      model: 'model',
      sensors: 'sensor modes',
      family: 'family',
      focalLengths: 'focal lengths',
      anamorphicSqueeze: 'squeeze',
    };
    return d ? `${name}: ${sub[d] ?? d}` : name;
  }
  if (a === 'optics' && b === 'mattes') return `Matte ${c === undefined ? '' : n(c)}`.trim();
  if (a === 'optics' && b === 'defaults') return `Default ${c ?? ''}`.trim();
  return joined || 'Profile';
}

// The schema's refine messages, phrased to follow the field label.
const CUSTOM_MESSAGES: Record<string, string> = {
  'Custom field keys must be unique and not a built-in token': 'need different token names, none of them a built-in token',
  'Camera names must be unique': 'need different names: the default camera is picked by name',
  'Lens family and name pairs must be unique': 'need different family and name pairs: the default lens is picked by them',
};

export function describeIssue(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'array' && issue.path[issue.path.length - 1] === 'options') {
        return 'needs at least one option, or switch the field to free text';
      }
      if (issue.origin === 'string') return min <= 1 ? "can't be empty" : `needs at least ${min} characters`;
      if (issue.origin === 'array') return min <= 1 ? 'needs at least one' : `needs at least ${min}`;
      return issue.inclusive ? `must be at least ${min}` : `must be more than ${min}`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return `is too long (${max} characters at most)`;
      if (issue.origin === 'array') return `has too many (${max} at most)`;
      return `must be ${max} or less`;
    }
    case 'invalid_format':
      return 'can only use lowercase letters and digits, starting with a letter';
    case 'invalid_value':
      return `should be ${issue.values.map((v) => JSON.stringify(v)).join(' or ')}`;
    case 'invalid_type':
      return issue.message.includes('received undefined') ? 'is missing' : `should be a ${issue.expected}`;
    case 'custom':
      return CUSTOM_MESSAGES[issue.message] ?? issue.message;
    default:
      return issue.message;
  }
}

export interface ReadableIssue {
  path: string;
  label: string;
  message: string;
}

export function readableIssues(issues: z.core.$ZodIssue[], profile?: unknown): ReadableIssue[] {
  return issues.map((issue) => ({
    path: issuePath(issue),
    label: fieldLabel(issue.path, profile),
    message: describeIssue(issue),
  }));
}

export type OpenResult =
  | { ok: true; profile: ProductionProfile; unknownKeys: string[] }
  | { ok: false; title: string; issues: ReadableIssue[] };

/**
 * Keys in the file that the schema doesn't know, so parsing dropped them
 * (a profile from a newer app or editor). Paths like "optics.cameras.0.iso".
 */
export function unknownKeys(raw: unknown, parsed: unknown, path = ''): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    return raw.flatMap((item, i) => unknownKeys(item, parsed[i], `${path}${i}.`));
  }
  if (!raw || typeof raw !== 'object' || !parsed || typeof parsed !== 'object' || Array.isArray(raw)) return [];
  const p = parsed as Record<string, unknown>;
  return Object.entries(raw as Record<string, unknown>).flatMap(([k, v]) =>
    k in p ? unknownKeys(v, p[k], `${path}${k}.`) : [`${path}${k}`],
  );
}

/** Parses the text of a .bpprod file. */
export function parseProfileText(text: string): OpenResult {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, title: "This file isn't a production profile (it isn't JSON).", issues: [] };
  }
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  if (!obj || obj.format !== PROFILE_FORMAT) {
    return { ok: false, title: "This file isn't a Byplay production profile.", issues: [] };
  }
  if (typeof obj.version === 'number' && obj.version > PROFILE_VERSION) {
    return {
      ok: false,
      title: `This profile uses format version ${obj.version}, which is newer than this editor understands. Reload the page to get the latest editor.`,
      issues: [],
    };
  }
  const r = ProductionProfileSchema.safeParse(json);
  if (r.success) return { ok: true, profile: r.data, unknownKeys: unknownKeys(json, r.data) };
  return {
    ok: false,
    title: "This profile has problems, so it can't be opened:",
    issues: readableIssues(r.error.issues, json),
  };
}

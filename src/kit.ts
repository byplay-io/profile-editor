// Camera and lens databases (copied from the app by scripts/sync-from-app.mjs)
// and helpers for turning their entries into profile values.
import cameraData from './data/camera_data.json';
import lensData from './data/lens_data.json';
import type { ProfileCamera, ProfileLens } from './schema';

export interface DbSensor {
  sensor: [number, number];
  mode?: string | null;
  name?: string | null;
  resolution?: [number, number];
}

export interface DbCamera {
  category: string;
  name: string;
  manufacturer?: string;
  model?: string;
  sensors: DbSensor[];
}

export interface DbLens {
  family: string;
  name: string;
  focalLengths: number[];
  anamorphicSqueeze: number;
}

// The Apple "Native Camera" entry stands for the device's own camera; it has no
// real sensor size and means nothing in a profile.
export const CAMERA_DB: DbCamera[] = (cameraData as DbCamera[]).filter((c) =>
  c.sensors.every((s) => s.sensor[0] > 0 && s.sensor[1] > 0),
);

export const LENS_DB: DbLens[] = lensData as DbLens[];

export const MAX_SENSORS_PER_CAMERA = 20;

/** The DB sensor's mode and name joined with a space, or undefined if it has neither. */
export function dbSensorMode(s: Pick<DbSensor, 'mode' | 'name'>): string | undefined {
  const mode = [s.mode, s.name]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return mode || undefined;
}

/** A sensor size as a label: [25.6, 13.5] → "25.6x13.5mm". */
export function sizeLabel([w, h]: readonly [number, number] | readonly number[]) {
  return `${w}x${h}mm`;
}

/**
 * Mode labels for sensors copied into one profile camera, unique within it,
 * because defaults.sensorMode picks a sensor by its mode:
 *   - mode and name joined, or the size when the DB has neither;
 *   - a label that repeats gets the size appended in parentheses
 *     (unless the label already is the size);
 *   - one that still repeats gets " #2", " #3", … (the first keeps its label).
 */
export function uniqueSensorModes(
  sensors: readonly { sensor: readonly [number, number]; mode?: string | null; name?: string | null }[],
): string[] {
  const bases = sensors.map((s) => dbSensorMode(s) ?? sizeLabel(s.sensor));
  const count = (labels: string[]) => labels.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>());
  const baseCounts = count(bases);
  const withSize = bases.map((b, i) => {
    const size = sizeLabel(sensors[i].sensor);
    return (baseCounts.get(b) ?? 0) > 1 && b !== size ? `${b} (${size})` : b;
  });
  const used = new Set<string>();
  const seen = new Map<string, number>();
  const all = new Set(withSize);
  return withSize.map((label) => {
    if (!used.has(label)) {
      used.add(label);
      seen.set(label, 1);
      return label;
    }
    let n = seen.get(label) ?? 1;
    let candidate: string;
    do {
      n++;
      candidate = `${label} #${n}`;
    } while (used.has(candidate) || all.has(candidate));
    seen.set(label, n);
    used.add(candidate);
    return candidate;
  });
}

export function profileCameraFromDb(cam: DbCamera, sensorIndices: number[]): ProfileCamera {
  const picked = sensorIndices.map((i) => cam.sensors[i]);
  const modes = uniqueSensorModes(picked);
  return {
    name: cam.name,
    manufacturer: cam.manufacturer ?? '',
    model: cam.model ?? '',
    sensors: picked.map((s, k) => ({ mode: modes[k], sensor: [s.sensor[0], s.sensor[1]] })),
  };
}

/** A label not yet used by any sensor of a camera, for a newly added mode. */
export function nextSensorMode(existing: readonly (string | undefined)[], sensor: readonly [number, number]) {
  const used = new Set(existing.filter(Boolean));
  const base = sizeLabel(sensor);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} #${n}`)) return `${base} #${n}`;
}

/** "Primes", "Primes 2", … : the first name not in `taken`. */
export function nextName(base: string, taken: readonly string[]) {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}

export function profileLensFromDb(lens: DbLens): ProfileLens {
  return {
    family: lens.family,
    name: lens.name,
    focalLengths: [...lens.focalLengths],
    anamorphicSqueeze: lens.anamorphicSqueeze,
  };
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function searchCameras(query: string, limit = 40): DbCamera[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return CAMERA_DB.filter((c) => {
    const hay = normalize(`${c.name} ${c.manufacturer ?? ''} ${c.model ?? ''} ${c.category}`);
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

export function formatMm(n: number) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function formatSensor([w, h]: [number, number]) {
  return `${formatMm(w)} × ${formatMm(h)} mm`;
}

// Mattes (frame lines) as aspect ratios.

export const MATTE_PRESETS: [number, number][] = [
  [2.39, 1],
  [2.35, 1],
  [2, 1],
  [1.9, 1],
  [1.85, 1],
  [16, 9],
  [1.66, 1],
  [4, 3],
];

export function formatRatio([w, h]: [number, number]) {
  return `${w}:${h}`;
}

/** "2.39:1", "2.39", "16:9", "16x9" → [w, h]; null if it isn't a ratio. */
export function parseRatio(text: string): [number, number] | null {
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:[:x×/]\s*(\d+(?:[.,]\d+)?))?$/i);
  if (!m) return null;
  const w = Number(m[1].replace(',', '.'));
  const h = m[2] === undefined ? 1 : Number(m[2].replace(',', '.'));
  if (!(w > 0 && h > 0 && w <= 100 && h <= 100)) return null;
  return [w, h];
}

export function sameRatio(a: readonly number[] | undefined, b: readonly number[] | undefined) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

/** "18, 25 35mm" → [18, 25, 35] (sorted, unique, positive). */
export function parseFocalLengths(text: string): number[] {
  const nums = text
    .split(/[\s,;]+/)
    .map((t) => Number(t.replace(/mm$/i, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

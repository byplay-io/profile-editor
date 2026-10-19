import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Draft, ReadableIssue } from './profile';
import type { TemplateValues } from './naming';
import type { TokenInfo } from './tokens';

/** Values used only for the naming preview; never saved in the profile. */
export interface SampleSlate {
  day: string;
  roll: string;
  scene: string;
  take: string;
  camera: string;
  /** datetime-local value, e.g. 2026-10-07T16:43:00 */
  datetime: string;
  seq: string;
  device: string;
  mode: string;
  /** null: follow the camera kit's default */
  body: string | null;
  focal: string | null;
  custom: Record<string, string>;
}

export interface EditorContextValue {
  draft: Draft;
  update: (recipe: (d: Draft) => void) => void;
  issues: ReadableIssue[];
  catalog: TokenInfo[];
  sample: SampleSlate;
  setSample: (recipe: (s: SampleSlate) => void) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor outside the editor');
  return ctx;
}

/** First validation message for a path (exact match or anything under it). */
export function issueFor(issues: ReadableIssue[], path: string, exact = false): string | null {
  const hit = issues.find((i) => (exact ? i.path === path : i.path === path || i.path.startsWith(`${path}.`)));
  return hit ? hit.message : null;
}

export function initialSample(): SampleSlate {
  const now = new Date();
  now.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    day: '1',
    roll: '1',
    scene: 'D12',
    take: '1',
    camera: 'A',
    datetime: local,
    seq: '1',
    device: 'iPad',
    mode: 'AR',
    body: null,
    focal: null,
    custom: {},
  };
}

export function sampleDate(sample: SampleSlate): Date {
  const m = sample.datetime.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return new Date();
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

/** Token values for the renderer: the sample slate plus what the profile itself provides. */
export function sampleValues(draft: Draft, sample: SampleSlate): TemplateValues {
  const optics = draft.optics;
  const values: TemplateValues = {
    project: draft.project,
    title: draft.title,
    day: sample.day,
    roll: sample.roll,
    scene: sample.scene,
    take: sample.take,
    camera: sample.camera,
    director: draft.slate.director,
    dp: draft.slate.dp,
    body: sample.body ?? (optics.defaults.camera || optics.cameras[0]?.name || 'Sony Venice 2'),
    focal: sample.focal ?? String(optics.defaults.focalLength ?? 35),
    seq: sample.seq,
    device: sample.device,
    mode: sample.mode,
  };
  for (const f of draft.slate.customFields) {
    values[f.key] = sample.custom[f.key] ?? f.options?.[0] ?? f.label;
  }
  return values;
}

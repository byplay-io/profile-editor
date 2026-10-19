import { describe, expect, it } from 'vitest';
import { templateWarnings } from '../src/naming-checks';
import { newDraft } from '../src/profile';

const draft = newDraft();
const warn = (t: string, kind: 'folder' | 'file' = 'file', capture: 'snapshot' | 'video' = 'snapshot', d = draft) =>
  templateWarnings(t, kind, capture, d).map((w) => w.text);

describe('naming warnings', () => {
  it('has none for the default templates', () => {
    expect(warn(draft.naming.snapshot.folder, 'folder')).toEqual([]);
    expect(warn(draft.naming.snapshot.file)).toEqual([]);
    expect(warn(draft.naming.video.file, 'file', 'video')).toEqual([]);
  });

  it('flags unknown tokens, braces that are not tokens and bad formats', () => {
    const w = warn('{project}_{unknown}_{Roll}_{date:QQ}_{roll:2}_{take}');
    expect(w.some((t) => t.startsWith('{unknown}'))).toBe(true);
    expect(w.some((t) => t.includes('{Roll}'))).toBe(true);
    expect(w.some((t) => t.startsWith('{date:QQ}'))).toBe(true);
    expect(w.some((t) => t.startsWith('{roll:2}'))).toBe(true);
  });

  it('knows custom field keys', () => {
    const d = newDraft();
    d.slate.customFields = [{ key: 'unit', label: 'Unit' }];
    expect(warn('{unit}_{take}', 'file', 'snapshot', d)).toEqual([]);
  });

  it('warns when snapshot names would collide', () => {
    expect(warn('{project}_{scene}').some((t) => t.includes('_v2'))).toBe(true);
    expect(warn('{project}_{scene}_{seq:03}')).toEqual([]);
    expect(warn('{project}_{scene}_{time}')).toEqual([]);
    const d = newDraft();
    d.slate.snapshotsAdvanceTake = false;
    expect(warn('{scene}_Tk{take}', 'file', 'snapshot', d).some((t) => t.includes("don't advance the take"))).toBe(true);
    expect(warn('{scene}_Tk{take}', 'file', 'video', d)).toEqual([]);
  });

  it('accepts 01 to 09 as padding and flags 00', () => {
    expect(warn('{roll:01}_{take:09}')).toEqual([]);
    expect(warn('{roll:00}_{take}').some((t) => t.startsWith('{roll:00} is ignored'))).toBe(true);
  });

  it('warns that leading dots are dropped', () => {
    expect(warn('.hidden/{project}', 'folder').some((t) => t.includes('start with a dot'))).toBe(true);
    expect(warn('{project}/.cache', 'folder').some((t) => t.includes('start with a dot'))).toBe(true);
  });

  it('warns about characters devices replace', () => {
    expect(warn('{project}:{take}').some((t) => t.includes('“:”'))).toBe(true);
    expect(warn('{project}/{take}').some((t) => t.includes('“/”'))).toBe(true);
    expect(warn('{project}/{take}', 'folder')).toEqual([]);
  });
});

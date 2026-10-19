import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_DB,
  dbSensorMode,
  MAX_SENSORS_PER_CAMERA,
  nextSensorMode,
  parseFocalLengths,
  parseRatio,
  profileCameraFromDb,
  uniqueSensorModes,
} from '../src/kit';
import {
  contentKey,
  deriveFieldKey,
  draftFromProfile,
  exportProfile,
  newDraft,
  parseProfileText,
  readableIssues,
  unknownKeys,
  validateDraft,
} from '../src/profile';
import { qrDataToJson } from '../src/qr/payload';
import { DEFAULT_NAMING, ProductionProfileSchema, ProfileCameraSchema } from '../src/schema';
import {
  insertSegment,
  moveSegment,
  parseItems,
  removeSegment,
  renameToken,
  serializeItems,
} from '../src/template-model';

const example = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'example.bpprod'), 'utf8'));

describe('template builder model', () => {
  const samples = [
    '',
    '{project}/Day_{day:02}',
    '{project}_Day-{day:02}_{date:YYYYMMDD}_{time:HHmm}_R{roll:02}_{scene}_Tk{take}',
    '__lead and trail__',
    '{a}{b} _ {c}//x/',
    '{Roll}_{ unknown }_{date:YYYY-MM-DD_HHmmss}',
    'a{b',
    '}{x:}{',
  ];

  it('round-trips any template exactly', () => {
    for (const s of samples) {
      expect(serializeItems(parseItems(s, 'folder'))).toBe(s);
      expect(serializeItems(parseItems(s, 'file'))).toBe(s);
    }
  });

  it("keeps a token's format text, even one with an underscore", () => {
    const items = parseItems('{date:YYYY-MM-DD_HHmmss}_{take}', 'file');
    expect(items.map((i) => i.kind)).toEqual(['seg', 'sep', 'seg']);
  });

  it('splits folders on / and parts on _ and space', () => {
    const items = parseItems('{project}/Day_{day:02}', 'folder');
    expect(items.map((i) => (i.kind === 'sep' ? i.text : 'S'))).toEqual(['S', '/', 'S', '_', 'S']);
  });

  it('moves parts while separators stay in place', () => {
    const items = parseItems('A_B_C', 'file');
    expect(serializeItems(moveSegment(items, 0, 2))).toBe('B_C_A');
    expect(serializeItems(moveSegment(items, 2, 0))).toBe('C_A_B');
  });

  it('removes a part with the right separator', () => {
    const items = parseItems('A/B_C', 'folder');
    expect(serializeItems(removeSegment(items, 1))).toBe('A/C');
    expect(serializeItems(removeSegment(parseItems('A_B/C', 'folder'), 1))).toBe('A/C');
    expect(serializeItems(removeSegment(items, 0))).toBe('B_C');
    expect(serializeItems(removeSegment(items, 2))).toBe('A/B');
  });

  it('inserts parts after a given one or at the end', () => {
    const items = parseItems('A_C', 'file');
    const piece = [{ kind: 'text' as const, text: 'B' }];
    expect(serializeItems(insertSegment(items, piece, '_', 0).items)).toBe('A_B_C');
    expect(serializeItems(insertSegment(items, piece, '_', null).items)).toBe('A_C_B');
    expect(serializeItems(insertSegment([], piece, '_', null).items)).toBe('B');
  });

  it('renames a custom token everywhere, keeping its format', () => {
    expect(renameToken('{unit}_{unit:02}_{units}', 'unit', 'crew')).toBe('{crew}_{crew:02}_{units}');
  });
});

describe('custom field keys', () => {
  it('derives valid, unique keys that are not built-in tokens', () => {
    expect(deriveFieldKey('Unit', [])).toBe('unit');
    expect(deriveFieldKey('Set-up no.', [])).toBe('setupno');
    expect(deriveFieldKey('Décor', [])).toBe('decor');
    expect(deriveFieldKey('2nd unit', [])).toBe('f2ndunit');
    expect(deriveFieldKey('Сцена', [])).toBe('field');
    expect(deriveFieldKey('Camera', [])).toBe('camera2');
    expect(deriveFieldKey('Unit', ['unit'])).toBe('unit2');
    const long = deriveFieldKey('A very long label that keeps going', []);
    expect(long).toMatch(/^[a-z][a-z0-9]{0,23}$/);
  });
});

describe('profiles', () => {
  it('a new profile is valid once it has a project code', () => {
    const d = newDraft();
    expect(validateDraft(d).ok).toBe(false);
    d.project = 'ABC';
    const r = validateDraft(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.naming).toEqual(DEFAULT_NAMING);
      expect(r.profile.optics).toBeUndefined();
      expect(r.profile.revision).toBe(1);
    }
  });

  it('opening and exporting without edits keeps revision and updatedAt', () => {
    const opened = parseProfileText(JSON.stringify(example));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const base = { revision: 3, updatedAt: example.updatedAt, key: contentKey(opened.profile) };
    const r = validateDraft(draftFromProfile(opened.profile));
    if (!r.ok) throw new Error('invalid');
    const out = exportProfile(r.profile, base, '2026-10-21T00:00:00.000Z');
    expect(out).toEqual(example);
    expect(JSON.stringify(out)).toBe(JSON.stringify(example));
  });

  it('an edited profile is exported with revision + 1, a new updatedAt and the same id', () => {
    const base = { revision: 3, updatedAt: example.updatedAt, key: contentKey(example) };
    const d = draftFromProfile(ProductionProfileSchema.parse(example));
    d.title = 'Renamed';
    const r = validateDraft(d);
    if (!r.ok) throw new Error('invalid');
    const out = exportProfile(r.profile, base, '2026-10-21T00:00:00.000Z');
    expect(out.revision).toBe(4);
    expect(out.updatedAt).toBe('2026-10-21T00:00:00.000Z');
    expect(out.id).toBe(example.id);
    expect(Object.keys(out)).toEqual(Object.keys(example));
  });

  it('reports readable problems for a broken file', () => {
    const bad = { ...example, project: '', slate: { ...example.slate, customFields: [{ key: 'take', label: 'Take' }] } };
    const r = parseProfileText(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = r.issues.map((i) => `${i.label} ${i.message}`);
    expect(text).toContain("Project code can't be empty");
    expect(text.some((t) => t.startsWith('Custom fields'))).toBe(true);
    expect(parseProfileText('nope').ok).toBe(false);
    expect(parseProfileText('{"format":"other"}').ok).toBe(false);
  });

  it('rejects duplicate cameras, duplicate lenses and empty pick lists, readably', () => {
    const d = draftFromProfile(ProductionProfileSchema.parse(example));
    d.optics.cameras.push(structuredClone(d.optics.cameras[0]));
    d.optics.lenses.push(structuredClone(d.optics.lenses[0]));
    d.slate.customFields[0].options = [];
    const r = validateDraft(d);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const text = readableIssues(r.issues, d).map((i) => `${i.label} ${i.message}`);
    expect(text).toContain('Cameras need different names: the default camera is picked by name');
    expect(text).toContain('Lenses need different family and name pairs: the default lens is picked by them');
    expect(text).toContain('“Unit” pick list needs at least one option, or switch the field to free text');
  });

  it('reports keys the editor would drop', () => {
    const raw = structuredClone(example);
    raw.future = 1;
    raw.optics.cameras[1].iso = 800;
    const r = parseProfileText(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unknownKeys.sort()).toEqual(['future', 'optics.cameras.1.iso']);
    expect(unknownKeys(example, ProductionProfileSchema.parse(example))).toEqual([]);
  });

  it('the fixture QR data is compact JSON', () => {
    const single = readFileSync(join(__dirname, 'fixtures', 'example.qr-single.txt'), 'utf8').split('\n')[0];
    expect(qrDataToJson(single.slice(5))).toEqual(example);
  });
});

describe('camera kit', () => {
  it('skips the Native Camera entry', () => {
    expect(CAMERA_DB.some((c) => c.name === 'Native Camera')).toBe(false);
    expect(CAMERA_DB.length).toBeGreaterThan(100);
  });

  const db = (name: string) => {
    const cam = CAMERA_DB.find((c) => c.name === name);
    if (!cam) throw new Error(`${name} missing from the DB`);
    return cam;
  };
  const all = (name: string) => db(name).sensors.map((_, i) => i);

  it('joins DB mode and name into the profile mode', () => {
    expect(dbSensorMode({ mode: '16:9', name: 'Super 35' })).toBe('16:9 Super 35');
    expect(dbSensorMode({ mode: '3:2' })).toBe('3:2');
    expect(dbSensorMode({ name: 'Open Gate' })).toBe('Open Gate');
    expect(dbSensorMode({ mode: null, name: '' })).toBeUndefined();
    expect(profileCameraFromDb(db('Sony FX5'), [0, 2])).toEqual({
      name: 'Sony FX5',
      manufacturer: 'Sony',
      model: 'FX5',
      sensors: [
        { mode: '3:2 Open Gate', sensor: [35.9, 24.0] },
        { mode: '16:9 Super 35', sensor: [23.5, 13.2] },
      ],
    });
  });

  it('labels a sensor with neither mode nor name by its size', () => {
    expect(profileCameraFromDb(db('ARRI ALEXA 35'), [0]).sensors).toEqual([{ mode: '27.99x19.22mm', sensor: [27.99, 19.22] }]);
  });

  it('Phantom v2640 ONYX: ten unnamed sensors get their sizes as unique modes', () => {
    const cam = profileCameraFromDb(db('Vision Research Phantom v2640 ONYX'), all('Vision Research Phantom v2640 ONYX'));
    expect(cam.sensors.map((s) => s.mode)).toEqual([
      '27.6x26.3mm',
      '27.6x19.4mm',
      '25.9x14.6mm',
      '13.8x13.2mm',
      '24.2x9.7mm',
      '8.6x6.5mm',
      '3.5x4.3mm',
      '3.5x0.9mm',
      '12.1x0.2mm',
      '24.2x0.1mm',
    ]);
  });

  it('ALEXA SXT: a repeated mode gets its size appended, the rest stay as they are', () => {
    const modes = profileCameraFromDb(db('ARRI ALEXA SXT'), all('ARRI ALEXA SXT')).sensors.map((s) => s.mode);
    expect(modes).toEqual([
      'Open Gate Mode 4K Cine',
      'Open Gate Mode 3.4K',
      '6:5 Mode 4K Cine Anamorphic',
      '6:5 Mode 2.6K',
      '6:5 Mode 2K Anamorphic',
      '4:3 Mode 2.8K',
      '16:9 Mode 4K UHD',
      '16:9 Mode 3.2K (26.4x14.85mm)',
      '16:9 Mode 3.2K (26.14x14.7mm)',
      '16:9 Mode 2.8K',
      '16:9 Mode 2K',
      '16:9 Mode HD',
    ]);
    // Picking only one of the two 3.2K modes needs no suffix.
    expect(profileCameraFromDb(db('ARRI ALEXA SXT'), [0, 8]).sensors.map((s) => s.mode)).toEqual([
      'Open Gate Mode 4K Cine',
      '16:9 Mode 3.2K',
    ]);
  });

  it('numbers labels that still repeat after the size', () => {
    const s = (mode: string | null, w = 10, h = 5) => ({ mode, sensor: [w, h] as [number, number] });
    expect(uniqueSensorModes([s('HD'), s('HD'), s('HD'), s('UHD')])).toEqual(['HD (10x5mm)', 'HD (10x5mm) #2', 'HD (10x5mm) #3', 'UHD']);
    expect(uniqueSensorModes([s(null), s(null), s(null, 4, 3)])).toEqual(['10x5mm', '10x5mm #2', '4x3mm']);
    // A generated label never collides with one that's already there.
    expect(uniqueSensorModes([s('A'), s('A'), s('A (10x5mm) #2')])).toEqual(['A (10x5mm)', 'A (10x5mm) #3', 'A (10x5mm) #2']);
    expect(nextSensorMode(['36x24mm', '36x24mm #2'], [36, 24])).toBe('36x24mm #3');
  });

  it('gives every camera in the DB unique, valid sensor modes', () => {
    for (const cam of CAMERA_DB) {
      const indices = cam.sensors.map((_, i) => i);
      const modes = profileCameraFromDb(cam, indices).sensors.map((s) => s.mode);
      expect(new Set(modes).size, cam.name).toBe(modes.length);
      for (const m of modes) expect(m && m.length <= 60, `${cam.name}: ${m}`).toBe(true);
      const picked = profileCameraFromDb(cam, indices.slice(0, MAX_SENSORS_PER_CAMERA));
      expect(ProfileCameraSchema.safeParse(picked).success, cam.name).toBe(true);
    }
  });

  it('parses ratios and focal lengths', () => {
    expect(parseRatio('2.39:1')).toEqual([2.39, 1]);
    expect(parseRatio('2.39')).toEqual([2.39, 1]);
    expect(parseRatio('16:9')).toEqual([16, 9]);
    expect(parseRatio('1,85')).toEqual([1.85, 1]);
    expect(parseRatio('wide')).toBeNull();
    expect(parseFocalLengths('35, 18 25mm 25')).toEqual([18, 25, 35]);
  });
});

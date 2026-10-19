import { useEffect, useMemo, useState } from 'preact/hooks';
import { issueFor, useEditor } from '../editor';
import {
  CAMERA_DB,
  type DbCamera,
  dbSensorMode,
  formatRatio,
  formatSensor,
  LENS_DB,
  MATTE_PRESETS,
  MAX_SENSORS_PER_CAMERA,
  nextName,
  nextSensorMode,
  parseFocalLengths,
  parseRatio,
  profileCameraFromDb,
  profileLensFromDb,
  sameRatio,
  searchCameras,
  uniqueSensorModes,
} from '../kit';
import type { ProfileCamera, ProfileLens } from '../schema';
import type { ReadableIssue } from '../profile';
import { Button, Icon, IconButton, Notice, NumberInput, Section, TextInput } from '../ui';

const MAX_CAMERAS = 20;
const MAX_LENSES = 20;
const MAX_MATTES = 10;

export function KitSection() {
  return (
    <Section
      id="kit"
      title="Camera kit"
      description="Optional. The cameras, lenses and frame lines this production shoots with. Devices get them, and the defaults at the bottom, when the profile is activated. Leave it empty if you don't need it."
    >
      <Cameras />
      <Lenses />
      <Mattes />
      <Defaults />
    </Section>
  );
}

// Cameras

function Cameras() {
  const { draft, update, issues } = useEditor();
  const cameras = draft.optics.cameras;
  const [open, setOpen] = useState<number | null>(null);
  const names = cameras.map((c) => c.name);
  const dupes = new Set(names.filter((n, i) => names.indexOf(n) !== i));

  const add = (cam: ProfileCamera) => {
    update((d) => {
      d.optics.cameras.push(cam);
    });
    return cameras.length;
  };

  return (
    <div class="subsection">
      <div class="subsection-head">
        <h3>Cameras</h3>
        <p class="muted small">Pick from {CAMERA_DB.length} cameras or add your own. Sensor sizes are in millimetres.</p>
      </div>
      <ListError issues={issues} path="optics.cameras" />
      {cameras.length > 0 && (
        <ul class="kit-list">
          {cameras.map((cam, i) => (
            <CameraItem
              key={i}
              index={i}
              camera={cam}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              duplicate={dupes.has(cam.name)}
              error={issueFor(issues, `optics.cameras.${i}`)}
            />
          ))}
        </ul>
      )}
      {cameras.length < MAX_CAMERAS ? (
        <CameraAdder
          existing={names}
          onAdd={(cam) => add(cam)}
          onAddCustom={() => {
            const n = add({
              name: nextName('Custom camera', names),
              manufacturer: '',
              model: '',
              sensors: [{ mode: '36x24mm', sensor: [36, 24] }],
            });
            setOpen(n);
          }}
        />
      ) : (
        <p class="muted small">That's the most a profile can hold ({MAX_CAMERAS}).</p>
      )}
    </div>
  );
}

function CameraItem({
  index,
  camera,
  open,
  onToggle,
  duplicate,
  error,
}: {
  index: number;
  camera: ProfileCamera;
  open: boolean;
  onToggle: () => void;
  duplicate: boolean;
  error: string | null;
}) {
  const { update } = useEditor();
  const edit = (recipe: (c: ProfileCamera, d: Parameters<Parameters<typeof update>[0]>[0]) => void) =>
    update((d) => recipe(d.optics.cameras[index], d));
  const modes = camera.sensors.length;
  const maker = [camera.manufacturer, camera.model].filter(Boolean).join(' · ');
  const modeNames = camera.sensors.map((s) => s.mode);
  const modeProblem = modeNames.some((m) => !m)
    ? 'Give every sensor mode a name: the default sensor mode is picked by name.'
    : new Set(modeNames).size !== modeNames.length
      ? 'Two sensor modes have the same name, so the default sensor mode can’t tell them apart.'
      : null;
  return (
    <li class={`kit-item ${open ? 'is-open' : ''}`}>
      <div class="kit-item-head">
        <button type="button" class="kit-toggle" aria-expanded={open} onClick={onToggle}>
          <Icon name={open ? 'down' : 'right'} size={16} />
          <span class="kit-name">{camera.name || 'Unnamed camera'}</span>
          <span class="kit-meta">
            {maker && `${maker} · `}
            {modes} sensor {modes === 1 ? 'mode' : 'modes'}
          </span>
        </button>
        <IconButton
          icon="trash"
          label={`Remove ${camera.name}`}
          onClick={() =>
            update((d) => {
              d.optics.cameras.splice(index, 1);
              if (d.optics.defaults.camera === camera.name) {
                delete d.optics.defaults.camera;
                delete d.optics.defaults.sensorMode;
              }
            })
          }
        />
      </div>
      {duplicate && <p class="field-error">Another camera has this name. Give each camera its own name.</p>}
      {error && <p class="field-error">{error}</p>}
      {modeProblem && <p class="field-hint warn-text">{modeProblem}</p>}
      {open && (
        <div class="kit-item-body">
          <div class="kit-fields">
            <label class="mini-field">
              <span>Name</span>
              <TextInput
                value={camera.name}
                maxLength={60}
                onValue={(v) =>
                  edit((c, d) => {
                    if (d.optics.defaults.camera === c.name) d.optics.defaults.camera = v;
                    c.name = v;
                  })
                }
              />
            </label>
            <label class="mini-field">
              <span>Manufacturer</span>
              <TextInput value={camera.manufacturer} maxLength={60} onValue={(v) => edit((c) => void (c.manufacturer = v))} />
            </label>
            <label class="mini-field">
              <span>Model</span>
              <TextInput value={camera.model} maxLength={60} onValue={(v) => edit((c) => void (c.model = v))} />
            </label>
          </div>
          <table class="sensor-table">
            <thead>
              <tr>
                <th scope="col">Sensor mode</th>
                <th scope="col">Width, mm</th>
                <th scope="col">Height, mm</th>
                <th scope="col">
                  <span class="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {camera.sensors.map((s, j) => (
                <tr key={j}>
                  <td>
                    <TextInput
                      value={s.mode ?? ''}
                      maxLength={60}
                      placeholder="No name"
                      aria-label="Sensor mode name"
                      onValue={(v) =>
                        edit((c, d) => {
                          const sensor = c.sensors[j];
                          const def = d.optics.defaults;
                          if (def.camera === c.name && def.sensorMode === sensor.mode) {
                            if (v) def.sensorMode = v;
                            else delete def.sensorMode;
                          }
                          if (v) sensor.mode = v;
                          else delete sensor.mode;
                        })
                      }
                    />
                  </td>
                  <td>
                    <NumberInput
                      value={s.sensor[0]}
                      aria-label="Sensor width in mm"
                      onValue={(v) => edit((c) => void (c.sensors[j].sensor[0] = v ?? 0))}
                    />
                  </td>
                  <td>
                    <NumberInput
                      value={s.sensor[1]}
                      aria-label="Sensor height in mm"
                      onValue={(v) => edit((c) => void (c.sensors[j].sensor[1] = v ?? 0))}
                    />
                  </td>
                  <td>
                    <IconButton
                      icon="x"
                      label="Remove this mode"
                      disabled={camera.sensors.length <= 1}
                      onClick={() => edit((c) => void c.sensors.splice(j, 1))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {camera.sensors.length < MAX_SENSORS_PER_CAMERA && (
            <Button
              variant="quiet"
              icon="plus"
              onClick={() =>
                edit((c) => {
                  const sensor: [number, number] = [...c.sensors[c.sensors.length - 1].sensor];
                  c.sensors.push({ mode: nextSensorMode(c.sensors.map((x) => x.mode), sensor), sensor });
                })
              }
            >
              Add sensor mode
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function CameraAdder({
  existing,
  onAdd,
  onAddCustom,
}: {
  existing: string[];
  onAdd: (cam: ProfileCamera) => void;
  onAddCustom: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<DbCamera | null>(null);
  const results = useMemo(() => searchCameras(query), [query]);

  if (picked) {
    return (
      <ModePicker
        camera={picked}
        already={existing.includes(picked.name)}
        onCancel={() => setPicked(null)}
        onAdd={(indices) => {
          onAdd(profileCameraFromDb(picked, indices));
          setPicked(null);
          setQuery('');
        }}
      />
    );
  }
  return (
    <div class="adder">
      <div class="search">
        <Icon name="search" size={18} />
        <input
          class="input search-input"
          type="search"
          value={query}
          placeholder={`Search cameras: Venice, Alexa 35, RED…`}
          aria-label="Search cameras"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      {query.trim() !== '' && (
        <ul class="results">
          {results.length === 0 && <li class="results-empty">No camera matches “{query}”. Add it as a custom camera.</li>}
          {results.map((c) => (
            <li key={c.name}>
              <button type="button" class="result" onClick={() => setPicked(c)}>
                <span class="result-name">{c.name}</span>
                <span class="result-meta">
                  {existing.includes(c.name)
                    ? 'In the kit'
                    : `${c.sensors.length} sensor ${c.sensors.length === 1 ? 'mode' : 'modes'}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="quiet" icon="plus" onClick={onAddCustom}>
        Add a custom camera
      </Button>
    </div>
  );
}

function ModePicker({
  camera,
  already,
  onAdd,
  onCancel,
}: {
  camera: DbCamera;
  already: boolean;
  onAdd: (indices: number[]) => void;
  onCancel: () => void;
}) {
  const all = camera.sensors.map((_, i) => i);
  const [sel, setSel] = useState<number[]>(all.length <= MAX_SENSORS_PER_CAMERA ? all : []);
  const toggle = (i: number) =>
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < MAX_SENSORS_PER_CAMERA ? [...s, i].sort((a, b) => a - b) : s));
  const many = all.length > MAX_SENSORS_PER_CAMERA;
  // The labels the picked modes get in the profile (unique within the camera).
  const labels = new Map(uniqueSensorModes(sel.map((i) => camera.sensors[i])).map((l, k) => [sel[k], l]));
  return (
    <div class="mode-picker">
      <div class="mode-picker-head">
        <div>
          <h4>{camera.name}</h4>
          <p class="muted small">
            {many
              ? `Pick up to ${MAX_SENSORS_PER_CAMERA} of its ${all.length} sensor modes.`
              : 'Pick the sensor modes the production uses.'}
          </p>
        </div>
        <div class="row-gap">
          {!many && (
            <button type="button" class="link-btn" onClick={() => setSel(sel.length === all.length ? [] : all)}>
              {sel.length === all.length ? 'Select none' : 'Select all'}
            </button>
          )}
        </div>
      </div>
      <ul class="mode-list">
        {camera.sensors.map((s, i) => {
          const checked = sel.includes(i);
          const mode = labels.get(i) ?? dbSensorMode(s);
          return (
            <li key={i}>
              <label class={`mode-option ${checked ? 'is-on' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(i)} disabled={!checked && sel.length >= MAX_SENSORS_PER_CAMERA} />
                <span class="mode-name">{mode ?? <span class="muted">No name: uses its size</span>}</span>
                <span class="mode-dims num">{formatSensor(s.sensor)}</span>
                {s.resolution && <span class="mode-res num">{`${s.resolution[0]} × ${s.resolution[1]}`}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      {already && (
        <Notice>
          This camera is already in the kit. To change its sensor modes, edit it in the list above. To add a second
          setup of the same body, add a custom camera with its own name.
        </Notice>
      )}
      <div class="row-gap">
        <Button variant="primary" icon="plus" disabled={sel.length === 0 || already} onClick={() => onAdd(sel)}>
          {sel.length === 0 ? 'Pick at least one mode' : `Add with ${sel.length} ${sel.length === 1 ? 'mode' : 'modes'}`}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// Lenses

const SQUEEZES = [1, 1.3, 1.5, 1.65, 1.8, 2];

function squeezeLabel(s: number) {
  return s === 1 ? 'Spherical' : `${s}× anamorphic`;
}

function focalSummary(f: number[]) {
  if (f.length === 0) return 'no focal lengths';
  if (f.length === 1) return `${f[0]} mm`;
  return `${f.length} focal lengths, ${f[0]}–${f[f.length - 1]} mm`;
}

function Lenses() {
  const { draft, update, issues } = useEditor();
  const lenses = draft.optics.lenses;
  const [open, setOpen] = useState<number | null>(null);
  const [dbPick, setDbPick] = useState('');
  const families = [...new Set(LENS_DB.map((l) => l.family))];
  const inKit = (family: string, name: string) => lenses.some((l) => l.family === family && l.name === name);

  const add = (lens: ProfileLens) => {
    update((d) => {
      d.optics.lenses.push(lens);
    });
    return lenses.length;
  };

  return (
    <div class="subsection">
      <div class="subsection-head">
        <h3>Lenses</h3>
        <p class="muted small">Lens sets with their focal lengths. Squeeze is 1 for spherical lenses.</p>
      </div>
      <ListError issues={issues} path="optics.lenses" />
      {lenses.length > 0 && (
        <ul class="kit-list">
          {lenses.map((lens, i) => (
            <LensItem
              key={i}
              index={i}
              lens={lens}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              duplicate={lenses.some((l, j) => j !== i && l.family === lens.family && l.name === lens.name)}
              error={issueFor(issues, `optics.lenses.${i}`)}
            />
          ))}
        </ul>
      )}
      {lenses.length < MAX_LENSES ? (
        <div class="adder adder-row">
          <select class="input" value={dbPick} aria-label="Lens set from the list" onChange={(e) => setDbPick(e.currentTarget.value)}>
            <option value="">Choose a lens set…</option>
            {families.map((fam) => (
              <optgroup label={fam} key={fam}>
                {LENS_DB.filter((l) => l.family === fam).map((l) => {
                  const id = `${l.family}\u0000${l.name}`;
                  return (
                    <option value={id} key={id} disabled={inKit(l.family, l.name)}>
                      {l.family} {l.name}
                      {l.anamorphicSqueeze !== 1 ? ` (${l.anamorphicSqueeze}× anamorphic)` : ''}
                      {inKit(l.family, l.name) ? ' · in the kit' : ''}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
          <Button
            icon="plus"
            disabled={!dbPick}
            onClick={() => {
              const [family, name] = dbPick.split('\u0000');
              const lens = LENS_DB.find((l) => l.family === family && l.name === name);
              if (lens) add(profileLensFromDb(lens));
              setDbPick('');
            }}
          >
            Add
          </Button>
          <Button
            variant="quiet"
            icon="plus"
            onClick={() =>
              setOpen(
                add({
                  family: 'Custom',
                  name: nextName('Primes', lenses.filter((l) => l.family === 'Custom').map((l) => l.name)),
                  focalLengths: [25, 35, 50, 85],
                  anamorphicSqueeze: 1,
                }),
              )
            }
          >
            Add a custom lens set
          </Button>
        </div>
      ) : (
        <p class="muted small">That's the most a profile can hold ({MAX_LENSES}).</p>
      )}
    </div>
  );
}

function LensItem({
  index,
  lens,
  open,
  onToggle,
  duplicate,
  error,
}: {
  index: number;
  lens: ProfileLens;
  open: boolean;
  onToggle: () => void;
  duplicate: boolean;
  error: string | null;
}) {
  const { update } = useEditor();
  const edit = (recipe: (l: ProfileLens, d: Parameters<Parameters<typeof update>[0]>[0]) => void) =>
    update((d) => recipe(d.optics.lenses[index], d));
  const isDefault = (d: Parameters<Parameters<typeof update>[0]>[0]) =>
    d.optics.defaults.lens?.family === lens.family && d.optics.defaults.lens?.name === lens.name;
  return (
    <li class={`kit-item ${open ? 'is-open' : ''}`}>
      <div class="kit-item-head">
        <button type="button" class="kit-toggle" aria-expanded={open} onClick={onToggle}>
          <Icon name={open ? 'down' : 'right'} size={16} />
          <span class="kit-name">
            {lens.family} {lens.name}
          </span>
          <span class="kit-meta">
            {focalSummary(lens.focalLengths)} · {squeezeLabel(lens.anamorphicSqueeze)}
          </span>
        </button>
        <IconButton
          icon="trash"
          label={`Remove ${lens.family} ${lens.name}`}
          onClick={() =>
            update((d) => {
              if (isDefault(d)) delete d.optics.defaults.lens;
              d.optics.lenses.splice(index, 1);
            })
          }
        />
      </div>
      {duplicate && <p class="field-error">Another lens set has this family and name. Give each one its own.</p>}
      {error && <p class="field-error">{error}</p>}
      {open && (
        <div class="kit-item-body">
          <div class="kit-fields">
            <label class="mini-field">
              <span>Family</span>
              <TextInput
                value={lens.family}
                maxLength={60}
                onValue={(v) =>
                  edit((l, d) => {
                    if (isDefault(d) && d.optics.defaults.lens) d.optics.defaults.lens.family = v;
                    l.family = v;
                  })
                }
              />
            </label>
            <label class="mini-field">
              <span>Name</span>
              <TextInput
                value={lens.name}
                maxLength={60}
                onValue={(v) =>
                  edit((l, d) => {
                    if (isDefault(d) && d.optics.defaults.lens) d.optics.defaults.lens.name = v;
                    l.name = v;
                  })
                }
              />
            </label>
            <label class="mini-field">
              <span>Squeeze</span>
              <select
                class="input"
                value={SQUEEZES.includes(lens.anamorphicSqueeze) ? String(lens.anamorphicSqueeze) : 'other'}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  if (v !== 'other') edit((l) => void (l.anamorphicSqueeze = Number(v)));
                }}
              >
                {SQUEEZES.map((s) => (
                  <option value={String(s)} key={s}>
                    {s === 1 ? '1 (spherical)' : `${s}×`}
                  </option>
                ))}
                {!SQUEEZES.includes(lens.anamorphicSqueeze) && <option value="other">{lens.anamorphicSqueeze}×</option>}
              </select>
            </label>
          </div>
          <FocalLengthsInput
            value={lens.focalLengths}
            onChange={(f) => edit((l) => void (l.focalLengths = f))}
          />
        </div>
      )}
    </li>
  );
}

function FocalLengthsInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => {
    if (parseFocalLengths(text).join() !== value.join()) setText(value.join(', '));
  }, [value]);
  return (
    <label class="mini-field">
      <span>Focal lengths, mm</span>
      <input
        class="input"
        value={text}
        inputMode="decimal"
        autocomplete="off"
        placeholder="18, 25, 35, 50"
        onInput={(e) => {
          setText(e.currentTarget.value);
          onChange(parseFocalLengths(e.currentTarget.value).slice(0, 40));
        }}
        onBlur={() => setText(parseFocalLengths(text).join(', '))}
      />
      <span class="field-hint">Separate with commas or spaces. Up to 40.</span>
    </label>
  );
}

// Mattes

function Mattes() {
  const { draft, update } = useEditor();
  const mattes = draft.optics.mattes;
  const [text, setText] = useState('');
  const parsed = parseRatio(text);
  const has = (r: [number, number]) => mattes.some((m) => sameRatio(m, r));
  const add = (r: [number, number]) =>
    update((d) => {
      if (d.optics.mattes.length < MAX_MATTES && !d.optics.mattes.some((m) => sameRatio(m, r))) d.optics.mattes.push(r);
    });
  return (
    <div class="subsection">
      <div class="subsection-head">
        <h3>Mattes</h3>
        <p class="muted small">Frame lines as aspect ratios, up to {MAX_MATTES}.</p>
      </div>
      <div class="chip-input chip-static">
        {mattes.length === 0 && <span class="muted small">No mattes yet.</span>}
        {mattes.map((m, i) => (
          <span class="chip" key={formatRatio(m)}>
            <span class="num">{formatRatio(m)}</span>
            <button
              type="button"
              class="chip-x"
              aria-label={`Remove ${formatRatio(m)}`}
              onClick={() =>
                update((d) => {
                  if (sameRatio(d.optics.defaults.matte, m)) delete d.optics.defaults.matte;
                  d.optics.mattes.splice(i, 1);
                })
              }
            >
              <Icon name="x" size={14} />
            </button>
          </span>
        ))}
      </div>
      {mattes.length < MAX_MATTES && (
        <div class="quick-picks">
          {MATTE_PRESETS.filter((r) => !has(r)).map((r) => (
            <button type="button" class="quick-pick num" key={formatRatio(r)} onClick={() => add(r)}>
              <Icon name="plus" size={14} />
              {formatRatio(r)}
            </button>
          ))}
          <form
            class="ratio-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (parsed) {
                add(parsed);
                setText('');
              }
            }}
          >
            <input
              class={`input ratio-input ${text && !parsed ? 'is-invalid' : ''}`}
              value={text}
              placeholder="Other, like 2.2:1"
              aria-label="Other aspect ratio"
              autocomplete="off"
              inputMode="decimal"
              onInput={(e) => setText(e.currentTarget.value)}
            />
            <Button type="submit" disabled={!parsed}>
              Add
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// Defaults

function Defaults() {
  const { draft, update } = useEditor();
  const { cameras, lenses, mattes, defaults } = draft.optics;
  const cam = cameras.find((c) => c.name === defaults.camera);
  const camModes = (cam?.sensors.map((s) => s.mode).filter(Boolean) ?? []) as string[];
  const lens = lenses.find((l) => l.family === defaults.lens?.family && l.name === defaults.lens?.name);
  const lensKey = (l: { family: string; name: string }) => `${l.family}\u0000${l.name}`;

  const problems: string[] = [];
  if (defaults.camera !== undefined && !cam) problems.push(`The default camera “${defaults.camera}” isn't in the kit.`);
  if (cam && defaults.sensorMode !== undefined && !camModes.includes(defaults.sensorMode))
    problems.push(`${cam.name} has no sensor mode called “${defaults.sensorMode}”.`);
  if (defaults.lens && !lens) problems.push(`The default lens “${defaults.lens.family} ${defaults.lens.name}” isn't in the kit.`);
  if (defaults.matte && !mattes.some((m) => sameRatio(m, defaults.matte))) problems.push(`The default matte ${formatRatio(defaults.matte)} isn't in the list.`);

  const empty = cameras.length === 0 && lenses.length === 0 && mattes.length === 0;
  return (
    <div class="subsection">
      <div class="subsection-head">
        <h3>Defaults</h3>
        <p class="muted small">Set on every device when the profile is activated. Choose from the kit above.</p>
      </div>
      {empty && defaults.focalLength === undefined ? (
        <p class="muted small">Add cameras, lenses or mattes first.</p>
      ) : (
        <div class="kit-fields defaults-grid">
          <label class="mini-field">
            <span>Camera</span>
            <select
              class="input"
              value={defaults.camera ?? ''}
              disabled={cameras.length === 0}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((d) => {
                  if (v) d.optics.defaults.camera = v;
                  else delete d.optics.defaults.camera;
                  const modes = d.optics.cameras.find((c) => c.name === v)?.sensors.map((s) => s.mode) ?? [];
                  if (!modes.includes(d.optics.defaults.sensorMode)) delete d.optics.defaults.sensorMode;
                });
              }}
            >
              <option value="">None</option>
              {defaults.camera !== undefined && !cam && <option value={defaults.camera}>{defaults.camera} (not in kit)</option>}
              {[...new Set(cameras.map((c) => c.name))].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label class="mini-field">
            <span>Sensor mode</span>
            <select
              class="input"
              value={defaults.sensorMode ?? ''}
              disabled={!cam || camModes.length === 0}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((d) => {
                  if (v) d.optics.defaults.sensorMode = v;
                  else delete d.optics.defaults.sensorMode;
                });
              }}
            >
              <option value="">{cam && camModes.length === 0 ? 'No named modes' : 'None'}</option>
              {defaults.sensorMode !== undefined && !camModes.includes(defaults.sensorMode) && (
                <option value={defaults.sensorMode}>{defaults.sensorMode} (not found)</option>
              )}
              {[...new Set(camModes)].map((m) => (
                <option value={m} key={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label class="mini-field">
            <span>Lens</span>
            <select
              class="input"
              value={defaults.lens ? lensKey(defaults.lens) : ''}
              disabled={lenses.length === 0}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((d) => {
                  if (!v) {
                    delete d.optics.defaults.lens;
                    return;
                  }
                  const [family, name] = v.split('\u0000');
                  d.optics.defaults.lens = { family, name };
                  const l = d.optics.lenses.find((x) => x.family === family && x.name === name);
                  const f = d.optics.defaults.focalLength;
                  if (l && f !== undefined && !l.focalLengths.includes(f)) delete d.optics.defaults.focalLength;
                });
              }}
            >
              <option value="">None</option>
              {defaults.lens && !lens && (
                <option value={lensKey(defaults.lens)}>
                  {defaults.lens.family} {defaults.lens.name} (not in kit)
                </option>
              )}
              {lenses.map((l) => (
                <option value={lensKey(l)} key={lensKey(l)}>
                  {l.family} {l.name}
                </option>
              ))}
            </select>
          </label>
          <label class="mini-field">
            <span>Focal length</span>
            {lens ? (
              <select
                class="input"
                value={defaults.focalLength === undefined ? '' : String(defaults.focalLength)}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  update((d) => {
                    if (v) d.optics.defaults.focalLength = Number(v);
                    else delete d.optics.defaults.focalLength;
                  });
                }}
              >
                <option value="">None</option>
                {defaults.focalLength !== undefined && !lens.focalLengths.includes(defaults.focalLength) && (
                  <option value={String(defaults.focalLength)}>{defaults.focalLength} mm</option>
                )}
                {lens.focalLengths.map((f) => (
                  <option value={String(f)} key={f}>
                    {f} mm
                  </option>
                ))}
              </select>
            ) : (
              <NumberInput
                value={defaults.focalLength}
                placeholder="mm"
                onValue={(v) =>
                  update((d) => {
                    if (v && v > 0) d.optics.defaults.focalLength = v;
                    else delete d.optics.defaults.focalLength;
                  })
                }
              />
            )}
          </label>
          <label class="mini-field">
            <span>Matte</span>
            <select
              class="input"
              value={defaults.matte ? formatRatio(defaults.matte) : ''}
              disabled={mattes.length === 0}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update((d) => {
                  const m = d.optics.mattes.find((x) => formatRatio(x) === v);
                  if (m) d.optics.defaults.matte = [m[0], m[1]];
                  else delete d.optics.defaults.matte;
                });
              }}
            >
              <option value="">None</option>
              {defaults.matte && !mattes.some((m) => sameRatio(m, defaults.matte)) && (
                <option value={formatRatio(defaults.matte)}>{formatRatio(defaults.matte)} (not in list)</option>
              )}
              {mattes.map((m) => (
                <option value={formatRatio(m)} key={formatRatio(m)}>
                  {formatRatio(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {problems.map((p) => (
        <Notice key={p}>{p}</Notice>
      ))}
    </div>
  );
}

/** A schema error about a whole list (uniqueness), e.g. path "optics.cameras". */
function ListError({ issues, path }: { issues: ReadableIssue[]; path: string }) {
  const issue = issues.find((i) => i.path === path);
  return issue ? (
    <Notice tone="error">
      {issue.label} {issue.message}.
    </Notice>
  ) : null;
}

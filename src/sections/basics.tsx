import { useEffect, useRef, useState } from 'preact/hooks';
import { issueFor, useEditor } from '../editor';
import { deriveFieldKey } from '../profile';
import { renameToken } from '../template-model';
import { Button, ChipListInput, Field, IconButton, Notice, Section, Segmented, Switch, TextInput } from '../ui';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormatter.format(d);
}

export function ProductionSection({ revision }: { revision: number }) {
  const { draft, update, issues } = useEditor();
  // Don't greet a new profile with an error; say so once they've been in the field.
  const [touched, setTouched] = useState(false);
  return (
    <Section id="production" title="Production">
      <div class="fields">
        <Field
          label="Project code"
          hint="Short code that goes into names, like ABC. Up to 24 characters."
          error={touched || draft.project ? issueFor(issues, 'project') : null}
        >
          {(id) => (
            <TextInput
              id={id}
              class="input-short"
              onBlur={() => setTouched(true)}
              value={draft.project}
              maxLength={24}
              placeholder="ABC"
              spellcheck={false}
              onValue={(v) =>
                update((d) => {
                  d.project = v;
                })
              }
            />
          )}
        </Field>
        <Field label="Title" hint="Optional. Goes into names only where you use the Title token." error={issueFor(issues, 'title')}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.title}
              maxLength={80}
              placeholder="Example Feature"
              onValue={(v) =>
                update((d) => {
                  d.title = v;
                })
              }
            />
          )}
        </Field>
      </div>
      <dl class="facts">
        <div>
          <dt>Profile ID</dt>
          <dd class="mono">{draft.id}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd class="num">{revision}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatUpdatedAt(draft.updatedAt)}</dd>
        </div>
      </dl>
      <p class="muted small">
        Devices recognise a profile by its ID. When you share an edited profile, its revision goes up by one, and
        devices that already have it replace their copy. The current day, roll, scene and take stay as they are on
        each device.
      </p>
    </Section>
  );
}

const LETTER_PRESETS = [['A'], ['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D']];

export function SlateSection() {
  const { draft, update, issues } = useEditor();
  const slate = draft.slate;
  return (
    <Section
      id="slate"
      title="Slate"
      description="What the crew fills in on each device before a capture. Values stay on the device; the profile only sets the choices."
    >
      <div class="fields">
        <Field
          label="Camera letters"
          hint="Letters to pick from. Leave empty to let the crew type any camera name."
          error={issueFor(issues, 'slate.cameraOptions')}
        >
          {(id) => (
            <div class="stack-sm">
              <ChipListInput
                id={id}
                values={slate.cameraOptions}
                max={12}
                maxLength={12}
                upper
                placeholder="Type a letter and press Enter"
                onChange={(v) =>
                  update((d) => {
                    d.slate.cameraOptions = v;
                  })
                }
              />
              <div class="quick-picks">
                {LETTER_PRESETS.map((p) => (
                  <button
                    type="button"
                    class="quick-pick"
                    key={p.join('')}
                    onClick={() =>
                      update((d) => {
                        d.slate.cameraOptions = [...p];
                      })
                    }
                  >
                    {p.join(', ')}
                  </button>
                ))}
                {slate.cameraOptions.length > 0 && (
                  <button
                    type="button"
                    class="quick-pick"
                    onClick={() =>
                      update((d) => {
                        d.slate.cameraOptions = [];
                      })
                    }
                  >
                    Free text
                  </button>
                )}
              </div>
            </div>
          )}
        </Field>
        <Field label="Director" hint="Filled in on every device when the profile is activated." error={issueFor(issues, 'slate.director')}>
          {(id) => (
            <TextInput
              id={id}
              value={slate.director}
              maxLength={60}
              onValue={(v) =>
                update((d) => {
                  d.slate.director = v;
                })
              }
            />
          )}
        </Field>
        <Field label="DP" hint="Filled in on every device when the profile is activated." error={issueFor(issues, 'slate.dp')}>
          {(id) => (
            <TextInput
              id={id}
              value={slate.dp}
              maxLength={60}
              onValue={(v) =>
                update((d) => {
                  d.slate.dp = v;
                })
              }
            />
          )}
        </Field>
      </div>

      <CustomFields />

      <div class="switches">
        <Switch
          label="Snapshots advance the take"
          hint="Each snapshot moves on to the next take, like a recording does."
          checked={slate.snapshotsAdvanceTake}
          onChange={(v) =>
            update((d) => {
              d.slate.snapshotsAdvanceTake = v;
            })
          }
        />
        <Switch
          label="Clear notes after each capture"
          hint="Notes describe one capture, so they're emptied once it's saved."
          checked={slate.clearNotesAfterCapture}
          onChange={(v) =>
            update((d) => {
              d.slate.clearNotesAfterCapture = v;
            })
          }
        />
      </div>
    </Section>
  );
}

function CustomFields() {
  const { draft, update, issues } = useEditor();
  const fields = draft.slate.customFields;
  const focusLast = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('.cf-label');
    inputs?.[inputs.length - 1]?.focus();
  });

  const rename = (index: number, label: string) =>
    update((d) => {
      const f = d.slate.customFields[index];
      const others = d.slate.customFields.filter((_, j) => j !== index).map((x) => x.key);
      // The key follows the label until someone has given it a key of its own.
      const auto = f.key === deriveFieldKey(f.label, others);
      f.label = label;
      if (!auto) return;
      const key = deriveFieldKey(label, others);
      if (key === f.key) return;
      for (const c of ['snapshot', 'video'] as const) {
        d.naming[c].folder = renameToken(d.naming[c].folder, f.key, key);
        d.naming[c].file = renameToken(d.naming[c].file, f.key, key);
      }
      f.key = key;
    });

  const listError = issues.find((i) => i.path === 'slate.customFields');
  return (
    <div class="subsection">
      <div class="subsection-head">
        <h3>Custom fields</h3>
        <p class="muted small">
          Extra slate fields, like Unit or Setup, up to 8. Each one becomes a part you can use in names.
        </p>
      </div>
      {listError && (
        <Notice tone="error">
          {listError.label} {listError.message}.
        </Notice>
      )}
      <div class="cf-list" ref={listRef}>
        {fields.map((f, i) => {
          const err = issueFor(issues, `slate.customFields.${i}`);
          return (
            <div class="cf-row" key={i}>
              <div class="cf-main">
                <label class="cf-name">
                  <span class="visually-hidden">Field name</span>
                  <input
                    class="input cf-label"
                    value={f.label}
                    maxLength={40}
                    placeholder="Field name, like Unit"
                    autocomplete="off"
                    onInput={(e) => rename(i, e.currentTarget.value)}
                  />
                </label>
                <code class="token-badge" title="Token for use in names">{`{${f.key}}`}</code>
                <Segmented
                  label={`${f.label || 'Field'} type`}
                  value={f.options ? 'list' : 'text'}
                  options={[
                    { value: 'text', label: 'Free text' },
                    { value: 'list', label: 'Pick list' },
                  ]}
                  onChange={(v) =>
                    update((d) => {
                      const field = d.slate.customFields[i];
                      if (v === 'list') field.options = field.options ?? [];
                      else delete field.options;
                    })
                  }
                />
                <IconButton
                  icon="trash"
                  label={`Remove ${f.label || 'field'}`}
                  onClick={() =>
                    update((d) => {
                      d.slate.customFields.splice(i, 1);
                    })
                  }
                />
              </div>
              {f.options && (
                <div class="cf-options">
                  <ChipListInput
                    values={f.options}
                    max={20}
                    maxLength={40}
                    autoFocus={f.options.length === 0}
                    placeholder="Type an option and press Enter"
                    onChange={(v) =>
                      update((d) => {
                        d.slate.customFields[i].options = v;
                      })
                    }
                  />
                </div>
              )}
              {err && <p class="field-error">{err}</p>}
            </div>
          );
        })}
      </div>
      <Button
        icon="plus"
        disabled={fields.length >= 8}
        onClick={() => {
          focusLast.current = true;
          update((d) => {
            const taken = d.slate.customFields.map((f) => f.key);
            d.slate.customFields.push({ key: deriveFieldKey('', taken), label: '' });
          });
        }}
      >
        Add field
      </Button>
    </div>
  );
}

export function CaptureSection() {
  const { draft, update } = useEditor();
  const c = draft.capture;
  return (
    <Section id="capture" title="Capture" description="Where snapshots go, and what gets logged.">
      <div class="switches">
        <Switch
          label="Save snapshots to Files"
          hint="Under the app’s folder in the Files app, named and filed as set under Naming."
          checked={c.saveToFiles}
          onChange={(v) =>
            update((d) => {
              d.capture.saveToFiles = v;
            })
          }
        />
        <Switch
          label="Also save snapshots to Photos"
          checked={c.saveToPhotos}
          onChange={(v) =>
            update((d) => {
              d.capture.saveToPhotos = v;
            })
          }
        />
        <Switch
          label="Keep a shot log"
          hint="Adds a row for each capture to shotlog.csv in the capture folder."
          checked={c.shotLog}
          onChange={(v) =>
            update((d) => {
              d.capture.shotLog = v;
            })
          }
        />
      </div>
      {!c.saveToFiles && !c.saveToPhotos && (
        <Notice>With both of these off, snapshots don't go to Files or Photos.</Notice>
      )}
    </Section>
  );
}

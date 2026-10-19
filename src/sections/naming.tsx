import { type ComponentChildren, Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { issueFor, sampleDate, sampleValues, useEditor } from '../editor';
import { formatDate, MAX_FILE_NAME_LENGTH, renderFileName, renderFolder, renderLevel, type TemplateValues } from '../naming';
import { type CaptureKind, templateWarnings } from '../naming-checks';
import { DEFAULT_NAMING, type ProductionProfile } from '../schema';
import {
  fromSlots,
  type Item,
  insertSegment,
  moveSegment,
  type Piece,
  parseItems,
  removeSegment,
  segmentIndices,
  serializeItems,
  stripReserved,
  type TemplateKind,
  toSlots,
  tokenText,
} from '../template-model';
import {
  DATE_PATTERN_PRESETS,
  DEFAULT_DATE_FORMATS,
  isDateToken,
  isValidDatePattern,
  padWidth,
  TOKEN_GROUPS,
  type TokenInfo,
} from '../tokens';
import { Button, Icon, IconButton, Section, Segmented, TextInput } from '../ui';

type Naming = ProductionProfile['naming'];

const PRESETS: { id: string; label: string; hint: string; naming: Naming }[] = [
  {
    id: 'default',
    label: 'Project and day',
    hint: 'A folder per shoot day; names start with the project code.',
    naming: DEFAULT_NAMING,
  },
  {
    id: 'date',
    label: 'Date first',
    hint: 'A folder per date; names start with date and time, so they sort by when they were taken.',
    naming: {
      snapshot: {
        folder: '{project}/{date:YYYY-MM-DD}',
        file: '{date:YYYYMMDD}_{time:HHmmss}_{project}_{scene}_Tk{take}',
      },
      video: {
        folder: '{project}/{date:YYYY-MM-DD}',
        file: '{date:YYYYMMDD}_{time:HHmmss}_{project}_{scene}_Tk{take}_{camera}',
      },
    },
  },
  {
    id: 'scene',
    label: 'Scene folders',
    hint: 'A folder per scene inside each shoot day; short names.',
    naming: {
      snapshot: { folder: '{project}/Day_{day:02}/{scene}', file: '{scene}_Tk{take}_{camera}_{seq:03}' },
      video: { folder: '{project}/Day_{day:02}/{scene}', file: '{scene}_Tk{take}_{camera}' },
    },
  },
];

const sameNaming = (a: Naming, b: Naming) => JSON.stringify(a) === JSON.stringify(b);

type EditorId = `${CaptureKind}.${TemplateKind}`;

export function NamingSection() {
  const { draft, update } = useEditor();
  const [active, setActive] = useState<EditorId | null>(null);
  const current = PRESETS.find((p) => sameNaming(p.naming, draft.naming));

  const applyPreset = (naming: Naming) => {
    const custom = !PRESETS.some((p) => sameNaming(p.naming, draft.naming));
    if (custom && !window.confirm('Replace all four naming templates with this preset?')) return;
    update((d) => {
      d.naming = structuredClone(naming);
    });
  };

  return (
    <Section
      id="naming"
      title="Naming"
      description={
        <>
          How every device names and files its snapshots and recordings. A name is built from parts. When a part
          refers to something empty on the slate, the whole part is left out: <code>R{'{roll}'}</code> disappears
          when there's no roll, instead of leaving a stray “R”.
        </>
      }
    >
      <div class="presets" role="group" aria-label="Start from a preset">
        <span class="presets-label">Start from</span>
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            class={`preset ${current?.id === p.id ? 'is-on' : ''}`}
            aria-pressed={current?.id === p.id}
            title={p.hint}
            onClick={() => applyPreset(p.naming)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div class="naming-layout">
        <div class="naming-main">
          <CaptureGroup capture="snapshot" title="Snapshots" active={active} setActive={setActive} />
          <CaptureGroup capture="video" title="Videos" active={active} setActive={setActive} />
        </div>
        <SamplePanel />
      </div>
    </Section>
  );
}

function CaptureGroup({
  capture,
  title,
  active,
  setActive,
}: {
  capture: CaptureKind;
  title: string;
  active: EditorId | null;
  setActive: (id: EditorId | null) => void;
}) {
  const { draft, update, sample, issues } = useEditor();
  const values = useMemo(() => sampleValues(draft, sample), [draft, sample]);
  const date = useMemo(() => sampleDate(sample), [sample]);
  const t = draft.naming[capture];
  const set = (kind: TemplateKind) => (v: string) =>
    update((d) => {
      d.naming[capture][kind] = v;
    });

  return (
    <div class="capture-group">
      <div class="capture-head">
        <h3>{title}</h3>
        <p class="muted small">
          {capture === 'snapshot'
            ? 'Saved as PNG under the app’s folder in the Files app.'
            : 'Each recording gets its own folder, named below. The files inside keep fixed names (video.mp4, …).'}
        </p>
      </div>
      <PathPreview capture={capture} folder={t.folder} file={t.file} values={values} date={date} />
      <TemplateEditor
        id={`${capture}.folder`}
        label="Folder"
        kind="folder"
        capture={capture}
        value={t.folder}
        onChange={set('folder')}
        active={active === `${capture}.folder`}
        onActivate={() => setActive(`${capture}.folder`)}
        values={values}
        date={date}
        error={issueFor(issues, `naming.${capture}.folder`)}
      />
      <TemplateEditor
        id={`${capture}.file`}
        label={capture === 'snapshot' ? 'File name' : 'Recording folder name'}
        kind="file"
        capture={capture}
        value={t.file}
        onChange={set('file')}
        active={active === `${capture}.file`}
        onActivate={() => setActive(`${capture}.file`)}
        values={values}
        date={date}
        error={issueFor(issues, `naming.${capture}.file`)}
      />
    </div>
  );
}

function PathPreview({
  capture,
  folder,
  file,
  values,
  date,
}: {
  capture: CaptureKind;
  folder: string;
  file: string;
  values: TemplateValues;
  date: Date;
}) {
  const levels = renderFolder(folder, values, date);
  const name = renderFileName(file, values, date);
  const cut = renderLevel(file.replace(/\//g, '_'), values, date).length > MAX_FILE_NAME_LENGTH;
  return (
    <div class="readout" aria-live="polite">
      <span class="readout-label">Preview</span>
      <p class="readout-path">
        {levels.map((l, i) => (
          <span key={i}>
            <span class="readout-level">{l}</span>
            <span class="readout-slash">/</span>
          </span>
        ))}
        {name ? (
          <span class="readout-file">
            {name}
            {capture === 'snapshot' ? '.png' : <span class="readout-dim">/video.mp4</span>}
          </span>
        ) : (
          <span class="readout-empty">(empty name)</span>
        )}
      </p>
      {cut && <p class="readout-note">Cut to {MAX_FILE_NAME_LENGTH} characters.</p>}
    </div>
  );
}

type Selection = { type: 'seg'; ord: number } | { type: 'sep'; index: number } | null;

function TemplateEditor({
  id,
  label,
  kind,
  capture,
  value,
  onChange,
  active,
  onActivate,
  values,
  date,
  error,
}: {
  id: EditorId;
  label: string;
  kind: TemplateKind;
  capture: CaptureKind;
  value: string;
  onChange: (v: string) => void;
  active: boolean;
  onActivate: () => void;
  values: TemplateValues;
  date: Date;
  error: string | null;
}) {
  const { draft, catalog } = useEditor();
  const items = useMemo(() => parseItems(value, kind), [value, kind]);
  const slots = segmentIndices(items);
  const [sel, setSel] = useState<Selection>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const focusOrd = useRef<number | null>(null);
  const warnings = useMemo(() => templateWarnings(value, kind, capture, draft), [value, kind, capture, draft]);

  // Keep the selection pointing at something that exists.
  const selection: Selection =
    sel?.type === 'seg' && sel.ord < slots.length
      ? sel
      : sel?.type === 'sep' && items[sel.index]?.kind === 'sep'
        ? sel
        : null;

  useEffect(() => {
    if (!active) setSel(null);
  }, [active]);

  useEffect(() => {
    if (focusOrd.current === null) return;
    rowRef.current?.querySelectorAll<HTMLElement>('[data-part]')[focusOrd.current]?.focus();
    focusOrd.current = null;
  });

  const commit = (next: Item[]) => onChange(serializeItems(next));
  const selectSeg = (ord: number) => {
    onActivate();
    setSel({ type: 'seg', ord });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= slots.length || from === to) return;
    commit(moveSegment(items, from, to));
    setSel({ type: 'seg', ord: to });
    focusOrd.current = to;
  };
  const remove = (ord: number) => {
    commit(removeSegment(items, ord));
    setSel(null);
  };
  const insert = (pieces: Piece[]) => {
    const after = selection?.type === 'seg' ? selection.ord : null;
    const r = insertSegment(items, pieces, kind === 'folder' ? '/' : '_', after);
    commit(r.items);
    setSel({ type: 'seg', ord: r.ord });
  };

  const drag = usePartDrag(rowRef, (from, to) => move(from, to));

  const tokenSample = (name: string, format?: string) => renderLevel(tokenText(name, format), values, date);
  const segDropped = (pieces: Piece[]) => pieces.some((p) => p.kind === 'token' && tokenSample(p.name, p.format) === '');

  const labelId = `${id}-label`;
  let ord = -1;
  return (
    <div class={`tpl ${active ? 'is-active' : ''}`}>
      <div class="tpl-head">
        <span class="tpl-label" id={labelId}>
          {label}
        </span>
        {!active && (
          <button type="button" class="link-btn" onClick={onActivate}>
            <Icon name="plus" size={16} /> Add a part
          </button>
        )}
      </div>
      <div
        class={`parts ${drag.state ? 'is-dragging' : ''}`}
        ref={rowRef}
        role="group"
        aria-labelledby={labelId}
        onClick={(e) => {
          if (e.target === e.currentTarget) onActivate();
        }}
      >
        {items.length === 0 && <span class="parts-empty">No parts yet. Add some below.</span>}
        {items.map((it, i) => {
          if (it.kind === 'sep') {
            const isSel = selection?.type === 'sep' && selection.index === i;
            return (
              <button
                type="button"
                key={`s${i}`}
                class={`sep ${isSel ? 'is-selected' : ''}`}
                aria-pressed={isSel}
                title="Separator. Click to change it."
                onClick={() => {
                  onActivate();
                  setSel({ type: 'sep', index: i });
                }}
              >
                {sepGlyph(it.text)}
              </button>
            );
          }
          ord++;
          const o = ord;
          const isSel = selection?.type === 'seg' && selection.ord === o;
          const dropped = segDropped(it.pieces);
          const dragging = drag.state?.from === o;
          return (
            <button
              type="button"
              key={`p${i}`}
              data-part
              class={`part ${isSel ? 'is-selected' : ''} ${dropped ? 'is-dropped' : ''} ${dragging ? 'is-lifted' : ''}`}
              style={dragging ? { transform: `translate(${drag.state?.dx ?? 0}px, ${drag.state?.dy ?? 0}px)` } : undefined}
              aria-pressed={isSel}
              title={dropped ? 'Left out with this sample slate: something in it is empty' : 'Drag to reorder'}
              onPointerDown={(e) => drag.start(e, o)}
              onClick={() => {
                if (drag.consumeClick()) return;
                selectSeg(o);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  remove(o);
                } else if ((e.altKey || e.metaKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault();
                  move(o, o + (e.key === 'ArrowLeft' ? -1 : 1));
                }
              }}
            >
              {it.pieces.map((p, k) =>
                p.kind === 'text' ? (
                  <span class="part-text" key={k}>
                    {p.text}
                  </span>
                ) : (
                  <TokenPill key={k} name={p.name} catalog={catalog} sample={tokenSample(p.name, p.format)} />
                ),
              )}
            </button>
          );
        })}
        {drag.state?.caret && (
          <span
            class="drop-caret"
            style={{
              transform: `translate(${drag.state.caret.x}px, ${drag.state.caret.y}px)`,
              height: `${drag.state.caret.h}px`,
            }}
          />
        )}
      </div>

      {active && selection?.type === 'seg' && (
        <PartInspector
          key={`${selection.ord}`}
          pieces={(items[slots[selection.ord]] as Extract<Item, { kind: 'seg' }>).pieces}
          index={selection.ord}
          count={slots.length}
          catalog={catalog}
          date={date}
          dropped={segDropped((items[slots[selection.ord]] as Extract<Item, { kind: 'seg' }>).pieces)}
          onChange={(pieces) => {
            const next = items.slice();
            next[slots[selection.ord]] = { kind: 'seg', pieces };
            commit(next);
          }}
          onMove={(dir) => move(selection.ord, selection.ord + dir)}
          onRemove={() => remove(selection.ord)}
          onClose={() => setSel(null)}
        />
      )}
      {active && selection?.type === 'sep' && (
        <div class="inspector">
          <div class="inspector-head">
            <span class="inspector-title">Separator</span>
            <IconButton icon="x" label="Done" onClick={() => setSel(null)} />
          </div>
          <Segmented
            label="Separator"
            value={(items[selection.index] as { text: string }).text}
            options={[
              { value: '_', label: 'Underscore _' },
              { value: ' ', label: 'Space' },
              ...(kind === 'folder' ? [{ value: '/', label: 'New folder /' }] : []),
            ]}
            onChange={(text) => {
              const next = items.slice();
              next[selection.index] = { kind: 'sep', text };
              commit(next);
            }}
          />
        </div>
      )}
      {active && (
        <Palette
          catalog={catalog}
          after={selection?.type === 'seg' ? selection.ord : null}
          onAdd={(name) => insert([{ kind: 'token', name }])}
          onAddText={() => insert([{ kind: 'text', text: 'Text' }])}
        />
      )}

      <div class="raw">
        <label class="raw-label" for={`${id}-raw`}>
          As text
        </label>
        <input
          id={`${id}-raw`}
          class="input raw-input"
          value={value}
          maxLength={300}
          spellcheck={false}
          autocomplete="off"
          autocapitalize="off"
          onFocus={onActivate}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      </div>
      {error && <p class="field-error">{label} {error}</p>}
      {warnings.length > 0 && (
        <ul class="warnings">
          {warnings.map((w) => (
            <li key={w.text}>
              <Icon name="warn" size={15} />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function sepGlyph(text: string): ComponentChildren {
  if (text === '/') return <span class="sep-slash">/</span>;
  if (text === ' ') return <span class="sep-space">space</span>;
  if (text === '_') return '_';
  return <span class="sep-run">{text.replace(/ /g, '␣')}</span>;
}

function TokenPill({ name, catalog, sample }: { name: string; catalog: TokenInfo[]; sample: string }) {
  const info = catalog.find((t) => t.name === name);
  return (
    <span class={`pill ${info ? '' : 'is-unknown'}`}>
      <span class="pill-label">{info ? info.label : `{${name}}`}</span>
      <span class="pill-sample">{sample || '—'}</span>
    </span>
  );
}

function Palette({
  catalog,
  after,
  onAdd,
  onAddText,
}: {
  catalog: TokenInfo[];
  after: number | null;
  onAdd: (name: string) => void;
  onAddText: () => void;
}) {
  return (
    <div class="palette">
      <p class="palette-hint">
        {after === null ? 'Add a part at the end:' : `Add a part after part ${after + 1}:`}
      </p>
      <div class="palette-groups">
        {TOKEN_GROUPS.map(({ group, label }) => {
          const tokens = catalog.filter((t) => t.group === group);
          if (!tokens.length) return null;
          return (
            <div class="palette-group" key={group}>
              <span class="palette-group-label">{label}</span>
              <div class="palette-tokens">
                {tokens.map((t) => (
                  <button type="button" key={t.name} class="palette-token" title={`${t.hint} · {${t.name}}`} onClick={() => onAdd(t.name)}>
                    <Icon name="plus" size={14} />
                    {t.label}
                  </button>
                ))}
                {group === 'slate' && (
                  <button type="button" class="palette-token palette-text" title="Fixed text, like Day or Tk" onClick={onAddText}>
                    <Icon name="plus" size={14} />
                    Text
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p class="palette-hint muted">Drag parts to reorder them (on iPad, touch and hold first). Click a part to edit it.</p>
    </div>
  );
}

function PartInspector({
  pieces,
  index,
  count,
  catalog,
  date,
  dropped,
  onChange,
  onMove,
  onRemove,
  onClose,
}: {
  pieces: Piece[];
  index: number;
  count: number;
  catalog: TokenInfo[];
  date: Date;
  dropped: boolean;
  onChange: (pieces: Piece[]) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const slots = toSlots(pieces);
  const hasTokens = slots.tokens.length > 0;
  const setText = (i: number, text: string) => {
    const texts = slots.texts.slice();
    texts[i] = text;
    onChange(fromSlots({ texts, tokens: slots.tokens }));
  };
  const setToken = (i: number, token: { name: string; format?: string }) => {
    const tokens = slots.tokens.slice();
    tokens[i] = token;
    onChange(fromSlots({ texts: slots.texts, tokens }));
  };
  const removeToken = (i: number) => {
    const texts = slots.texts.slice();
    texts.splice(i, 2, texts[i] + texts[i + 1]);
    const tokens = slots.tokens.filter((_, j) => j !== i);
    if (!tokens.length && !texts.join('')) onRemove();
    else onChange(fromSlots({ texts, tokens }));
  };

  const textLabel = (i: number) =>
    !hasTokens ? 'Text' : i === 0 ? 'Text before' : i === slots.tokens.length ? 'Text after' : 'Text between';

  return (
    <div class="inspector">
      <div class="inspector-head">
        <span class="inspector-title">
          Part {index + 1} of {count}
          {dropped && <span class="inspector-note"> · left out with this sample slate</span>}
        </span>
        <div class="inspector-actions">
          <IconButton icon="left" label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon="right" label="Move later" disabled={index === count - 1} onClick={() => onMove(1)} />
          <Button variant="quiet" icon="trash" onClick={onRemove}>
            Remove
          </Button>
          <IconButton icon="x" label="Done" onClick={onClose} />
        </div>
      </div>
      <div class="inspector-grid">
        {slots.texts.map((text, i) => (
          <Fragment key={i}>
            <TextSlot
              label={textLabel(i)}
              value={text}
              autoFocus={!hasTokens && text === 'Text'}
              canBeEmpty={hasTokens}
              onValue={(v) => setText(i, v)}
              onEmpty={onRemove}
            />
            {slots.tokens[i] && (
              <TokenSlot
                token={slots.tokens[i]}
                catalog={catalog}
                date={date}
                onChange={(t) => setToken(i, t)}
                onRemove={() => removeToken(i)}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TextSlot({
  label,
  value,
  onValue,
  canBeEmpty,
  onEmpty,
  autoFocus,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  canBeEmpty: boolean;
  onEmpty: () => void;
  autoFocus?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [hint, setHint] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== local && (local !== '' || canBeEmpty)) setLocal(value);
  }, [value]);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, []);
  return (
    <div class="slot">
      <label class="slot-label">
        {label}
        <input
          ref={ref}
          class="input"
          value={local}
          maxLength={60}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => {
            const raw = e.currentTarget.value;
            const clean = stripReserved(raw);
            setHint(clean !== raw);
            if (clean !== raw) e.currentTarget.value = clean;
            setLocal(clean);
            // A part with no token and no text would vanish mid-edit; wait for blur.
            if (clean !== '' || canBeEmpty) onValue(clean);
          }}
          onBlur={() => {
            if (local === '' && !canBeEmpty) onEmpty();
          }}
        />
      </label>
      {hint && <p class="field-hint">Separators (_ space /) go between parts, and braces start tokens.</p>}
    </div>
  );
}

function TokenSlot({
  token,
  catalog,
  date,
  onChange,
  onRemove,
}: {
  token: { name: string; format?: string };
  catalog: TokenInfo[];
  date: Date;
  onChange: (t: { name: string; format?: string }) => void;
  onRemove: () => void;
}) {
  const known = catalog.some((t) => t.name === token.name);
  const dateLike = isDateToken(token.name);
  return (
    <div class="slot-token">
      <div class="slot slot-value">
        <span class="slot-label">Value</span>
        <div class="slot-value-row">
          <select
            class="input"
            aria-label="Value"
            value={token.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              // Formats don't carry over between dates and numbers.
              const keep = isDateToken(name) === dateLike;
              onChange({ name, format: keep ? token.format : undefined });
            }}
          >
            {!known && <option value={token.name}>{`{${token.name}} (not a token)`}</option>}
            {TOKEN_GROUPS.map(({ group, label }) => {
              const tokens = catalog.filter((t) => t.group === group);
              return tokens.length ? (
                <optgroup label={label} key={group}>
                  {tokens.map((t) => (
                    <option value={t.name} key={t.name}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <IconButton icon="x" label="Remove this value from the part" onClick={onRemove} />
        </div>
      </div>
      {dateLike ? (
        <DateFormat name={token.name} format={token.format} date={date} onChange={(format) => onChange({ ...token, format })} />
      ) : (
        <PadFormat format={token.format} onChange={(format) => onChange({ ...token, format })} />
      )}
    </div>
  );
}

function PadFormat({ format, onChange }: { format?: string; onChange: (f: string | undefined) => void }) {
  const width = padWidth(format);
  const options: { value: string; label: string; title?: string }[] = [
    { value: '', label: 'Off', title: '1 stays 1' },
    { value: '02', label: '01', title: '1 becomes 01' },
    { value: '03', label: '001', title: '1 becomes 001' },
    { value: '04', label: '0001', title: '1 becomes 0001' },
  ];
  const current = format ?? '';
  if (!options.some((o) => o.value === current)) options.push({ value: current, label: width ? '0'.repeat(width - 1) + '1' : current });
  return (
    <div class="slot slot-format">
      <span class="slot-label">Pad numbers with zeros</span>
      <Segmented label="Pad numbers with zeros" value={current} options={options} onChange={(v) => onChange(v || undefined)} />
    </div>
  );
}

function DateFormat({
  name,
  format,
  date,
  onChange,
}: {
  name: string;
  format?: string;
  date: Date;
  onChange: (f: string | undefined) => void;
}) {
  const presets = DATE_PATTERN_PRESETS[name] ?? [];
  const def = DEFAULT_DATE_FORMATS[name];
  const current = format ?? def;
  const isPreset = presets.includes(current);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div class="slot slot-format">
      <span class="slot-label">Format</span>
      <div class="date-format">
        <select
          class="input"
          value={custom ? '__custom' : current}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === '__custom') {
              setCustom(true);
              return;
            }
            setCustom(false);
            onChange(v === def ? undefined : v);
          }}
        >
          {presets.map((p) => (
            <option value={p} key={p}>
              {formatDate(date, p)} · {p}
            </option>
          ))}
          <option value="__custom">Custom pattern…</option>
        </select>
        {custom && (
          <TextInput
            class={isValidDatePattern(current) ? '' : 'is-invalid'}
            value={current}
            maxLength={40}
            spellcheck={false}
            aria-label="Date pattern"
            onValue={(v) => onChange(v.replace(/[{}]/g, '') || undefined)}
          />
        )}
      </div>
      {custom && (
        <span class={`field-hint ${isValidDatePattern(current) ? '' : 'warn-text'}`}>
          Comes out as {formatDate(date, current)}. YYYY, YY, MM, DD, HH, mm and ss are replaced; anything else is
          written as is, so stick to - . _ between them.
        </span>
      )}
    </div>
  );
}

function SamplePanel() {
  const { draft, sample, setSample } = useEditor();
  const set = (k: keyof Omit<typeof sample, 'custom'>) => (v: string) =>
    setSample((s) => {
      s[k] = v;
    });
  const values = sampleValues(draft, sample);
  const letters = draft.slate.cameraOptions;
  return (
    <aside class="sample" aria-labelledby="sample-title">
      <h3 id="sample-title">Sample slate</h3>
      <p class="muted small">
        Only for the preview: devices fill these in on set. Clear one to see which parts drop out.
      </p>
      <div class="sample-grid">
        <SampleField label="Shoot day" value={sample.day} onValue={set('day')} numeric />
        <SampleField label="Roll" value={sample.roll} onValue={set('roll')} />
        <SampleField label="Scene" value={sample.scene} onValue={set('scene')} />
        <SampleField label="Take" value={sample.take} onValue={set('take')} numeric />
        {letters.length ? (
          <SampleSelect label="Camera" value={sample.camera} options={letters} onValue={set('camera')} />
        ) : (
          <SampleField label="Camera" value={sample.camera} onValue={set('camera')} />
        )}
        <SampleField label="Counter" value={sample.seq} onValue={set('seq')} numeric />
        <label class="sample-field sample-wide">
          <span>Date and time</span>
          <input
            class="input"
            type="datetime-local"
            step="1"
            value={sample.datetime}
            onInput={(e) => e.currentTarget.value && set('datetime')(e.currentTarget.value)}
          />
        </label>
        {draft.slate.customFields.map((f) =>
          f.options?.length ? (
            <SampleSelect
              key={f.key}
              label={f.label || f.key}
              value={String(values[f.key] ?? '')}
              options={f.options}
              onValue={(v) =>
                setSample((s) => {
                  s.custom[f.key] = v;
                })
              }
            />
          ) : (
            <SampleField
              key={f.key}
              label={f.label || f.key}
              value={String(values[f.key] ?? '')}
              onValue={(v) =>
                setSample((s) => {
                  s.custom[f.key] = v;
                })
              }
            />
          ),
        )}
        <SampleField label="Camera body" value={String(values.body ?? '')} onValue={set('body')} wide />
        <SampleField label="Focal length" value={String(values.focal ?? '')} onValue={set('focal')} numeric />
        <SampleSelect label="Mode" value={sample.mode} options={['AR', '3D', 'Drone']} onValue={set('mode')} required />
        <SampleField label="Device name" value={sample.device} onValue={set('device')} wide />
      </div>
    </aside>
  );
}

function SampleField({
  label,
  value,
  onValue,
  numeric,
  wide,
}: {
  label: string;
  value: string;
  onValue: (v: string) => void;
  numeric?: boolean;
  wide?: boolean;
}) {
  return (
    <label class={`sample-field ${wide ? 'sample-wide' : ''}`}>
      <span>{label}</span>
      <input
        class="input"
        value={value}
        inputMode={numeric ? 'numeric' : undefined}
        autocomplete="off"
        spellcheck={false}
        placeholder="empty"
        onInput={(e) => onValue(e.currentTarget.value)}
      />
    </label>
  );
}

function SampleSelect({
  label,
  value,
  options,
  onValue,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onValue: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label class="sample-field">
      <span>{label}</span>
      <select class="input" value={value} onChange={(e) => onValue(e.currentTarget.value)}>
        {!required && <option value="">(empty)</option>}
        {!options.includes(value) && value && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// Pointer-driven reordering of parts. Mouse: press and move. Touch: touch and
// hold, then move (so a swipe over the parts still scrolls the page).

interface DragState {
  from: number;
  dx: number;
  dy: number;
  to: number;
  caret: { x: number; y: number; h: number } | null;
}

function usePartDrag(rowRef: { current: HTMLDivElement | null }, onDrop: (from: number, to: number) => void) {
  const [state, setState] = useState<DragState | null>(null);
  const suppressClick = useRef(false);

  const start = (e: PointerEvent, from: number) => {
    if (e.button !== 0 || !rowRef.current) return;
    const row = rowRef.current;
    const sx = e.clientX;
    const sy = e.clientY;
    const touch = e.pointerType !== 'mouse';
    let active = false;
    let timer = 0;
    let rects: DOMRect[] = [];
    let rowRect: DOMRect = row.getBoundingClientRect();
    let to = from;

    const caretAt = (index: number) => {
      if (!rects.length) return null;
      const r = index < rects.length ? rects[index] : rects[rects.length - 1];
      const x = index < rects.length ? r.left - 4 : r.right + 3;
      return { x: x - rowRect.left, y: r.top - rowRect.top, h: r.height };
    };
    const insertionIndex = (x: number, y: number) => {
      let idx = 0;
      rects.forEach((r, i) => {
        if (y > r.bottom || (y >= r.top && x > r.left + r.width / 2)) idx = i + 1;
      });
      return idx;
    };
    const begin = () => {
      active = true;
      rowRect = row.getBoundingClientRect();
      rects = Array.from(row.querySelectorAll<HTMLElement>('[data-part]'), (el) => el.getBoundingClientRect());
      to = from;
      setState({ from, dx: 0, dy: 0, to: from, caret: caretAt(from) });
      if (touch && navigator.vibrate) navigator.vibrate(10);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!active) {
        if (touch) {
          if (Math.hypot(dx, dy) > 10) cleanup();
          return;
        }
        if (Math.hypot(dx, dy) < 5) return;
        begin();
      }
      to = insertionIndex(ev.clientX, ev.clientY);
      setState({ from, dx, dy, to, caret: caretAt(to) });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (active) {
        suppressClick.current = true;
        const final = to > from ? to - 1 : to;
        if (final !== from) onDrop(from, final);
      }
      cleanup();
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };
    const onContextMenu = (ev: Event) => {
      if (active) ev.preventDefault();
    };
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cleanup);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('contextmenu', onContextMenu);
      active = false;
      setState(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cleanup);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('contextmenu', onContextMenu);
    if (touch) timer = window.setTimeout(begin, 300);
  };

  const consumeClick = () => {
    const s = suppressClick.current;
    suppressClick.current = false;
    return s;
  };

  return { state, start, consumeClick };
}

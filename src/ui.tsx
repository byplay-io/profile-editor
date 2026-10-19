import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';

// Icons: 2px stroke, 24px grid, drawn by hand (no icon package).

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  open: 'M4 7.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-7l-2-2.5H5A1 1 0 0 0 4 6.5z',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7zM14 3v4h4M12 11v6M9 14h6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  share: 'M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5v14M16 5v14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  warn: 'M12 4l9 16H3zM12 10v4M12 17.5v.5',
  check: 'M5 12.5l4.5 4.5L19 7',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l4 4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  offline: 'M12 4v10M8 10l4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      class="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

type ButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'on-teal' | 'on-teal-quiet' | 'on-teal-outline';
  icon?: IconName;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function Button({ variant = 'secondary', icon, children, class: cls, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} class={`btn btn-${variant} ${cls ?? ''}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  class: cls,
  ...rest
}: JSX.HTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; disabled?: boolean }) {
  return (
    <button type="button" class={`icon-btn ${cls ?? ''}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: ComponentChildren;
  hint?: ComponentChildren;
  error?: string | null;
  children: (id: string) => ComponentChildren;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div class={`field ${wide ? 'field-wide' : ''} ${error ? 'has-error' : ''}`}>
      <label class="field-label" for={id}>
        {label}
      </label>
      <div class="field-control">
        {children(id)}
        {error ? <p class="field-error">{error}</p> : hint ? <p class="field-hint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function TextInput({
  value,
  onValue,
  class: cls,
  ...rest
}: Omit<JSX.HTMLAttributes<HTMLInputElement>, 'value'> & {
  value: string;
  onValue: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  id?: string;
  type?: string;
  inputMode?: string;
}) {
  return (
    <input
      class={`input ${cls ?? ''}`}
      type="text"
      value={value}
      onInput={(e) => onValue(e.currentTarget.value)}
      autocomplete="off"
      {...rest}
    />
  );
}

function parseNumber(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(n) ? null : n;
}

/** A number field that lets you type freely and reports a number (or null while blank/invalid). */
export function NumberInput({
  value,
  onValue,
  class: cls,
  ...rest
}: Omit<JSX.HTMLAttributes<HTMLInputElement>, 'value'> & {
  value: number | null | undefined;
  onValue: (v: number | null) => void;
  placeholder?: string;
  id?: string;
  step?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  // Follow outside changes, but leave in-progress typing ("1." on the way to "1.5") alone.
  useEffect(() => {
    if (parseNumber(text) !== (value ?? null)) setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <input
      class={`input input-number ${cls ?? ''}`}
      type="text"
      inputMode="decimal"
      value={text}
      autocomplete="off"
      onInput={(e) => {
        setText(e.currentTarget.value);
        onValue(parseNumber(e.currentTarget.value));
      }}
      {...rest}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ComponentChildren;
  hint?: ComponentChildren;
}) {
  const id = useId();
  return (
    <div class="switch-row">
      <div class="switch-text">
        <label for={id} class="switch-label">
          {label}
        </label>
        {hint && <p class="field-hint">{hint}</p>}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        class="switch"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ComponentChildren; title?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'is-on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A list of short strings edited as chips: type and press Enter (or comma) to add,
 * click × to remove. Used for camera letters and pick-list options.
 */
export function ChipListInput({
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  id,
  upper,
  autoFocus,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  maxLength: number;
  placeholder: string;
  id?: string;
  upper?: boolean;
  /** Focus the text field when this mounts (e.g. a pick list that was just turned on). */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, []);
  const full = values.length >= max;
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => (upper ? s.trim().toUpperCase() : s.trim()).slice(0, maxLength))
      .filter((s) => s && !values.includes(s));
    if (parts.length) onChange([...values, ...parts].slice(0, max));
    setDraft('');
  };
  return (
    <div class="chip-input">
      {values.map((v, i) => (
        <span class="chip" key={v}>
          <span>{v}</span>
          <button
            type="button"
            class="chip-x"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Icon name="x" size={14} />
          </button>
        </span>
      ))}
      {!full && (
        <input
          ref={inputRef}
          id={id}
          class="chip-input-field"
          value={draft}
          maxLength={maxLength + 1}
          placeholder={values.length ? 'Add…' : placeholder}
          autocomplete="off"
          autocapitalize={upper ? 'characters' : 'sentences'}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (v.includes(',')) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && draft === '' && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
      )}
    </div>
  );
}

export function Notice({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'error' | 'info';
  children: ComponentChildren;
}) {
  return (
    <div class={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={tone === 'info' ? 'lock' : 'warn'} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Section({
  id,
  title,
  description,
  children,
  aside,
}: {
  id: string;
  title: string;
  description?: ComponentChildren;
  children: ComponentChildren;
  aside?: ComponentChildren;
}) {
  return (
    <section id={id} class="section" aria-labelledby={`${id}-title`}>
      <header class="section-head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p class="section-desc">{description}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

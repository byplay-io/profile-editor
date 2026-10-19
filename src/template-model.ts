// The chip builder's view of a naming template: a row of segments ("parts")
// with separator runs between them, mirroring the renderer's rules — a part that
// refers to an empty value is left out together with its own text.
//
// The template string stays the source of truth. parseItems/serializeItems
// round-trip any string exactly, so the builder and the raw field never fight.

export type Piece =
  | { kind: 'text'; text: string }
  | { kind: 'token'; name: string; format?: string };

export type Item = { kind: 'seg'; pieces: Piece[] } | { kind: 'sep'; text: string };

export type TemplateKind = 'folder' | 'file';

// Same token grammar as naming.ts; anything else in braces is plain text there.
const TOKEN_RE = /\{([a-z][a-z0-9]*)(?::([^}]*))?\}/g;

export function separatorsFor(kind: TemplateKind) {
  return kind === 'folder' ? '_ /' : '_ ';
}

export function tokenText(name: string, format?: string) {
  return format === undefined ? `{${name}}` : `{${name}:${format}}`;
}

export function parseItems(template: string, kind: TemplateKind): Item[] {
  const seps = separatorsFor(kind);
  const items: Item[] = [];
  let seg: Piece[] | null = null;
  let sep = '';

  const addPiece = (piece: Piece) => {
    if (sep) {
      items.push({ kind: 'sep', text: sep });
      sep = '';
    }
    if (!seg) seg = [];
    const last = seg[seg.length - 1];
    if (piece.kind === 'text' && last?.kind === 'text') last.text += piece.text;
    else seg.push(piece);
  };
  const closeSeg = () => {
    if (seg) items.push({ kind: 'seg', pieces: seg });
    seg = null;
  };
  const addText = (text: string) => {
    for (const ch of text) {
      if (seps.includes(ch)) {
        closeSeg();
        sep += ch;
      } else {
        addPiece({ kind: 'text', text: ch });
      }
    }
  };

  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    addText(template.slice(last, m.index));
    addPiece({ kind: 'token', name: m[1], format: m[2] });
    last = (m.index ?? 0) + m[0].length;
  }
  addText(template.slice(last));
  closeSeg();
  if (sep) items.push({ kind: 'sep', text: sep });
  return items;
}

export function serializePieces(pieces: Piece[]) {
  return pieces.map((p) => (p.kind === 'text' ? p.text : tokenText(p.name, p.format))).join('');
}

export function serializeItems(items: Item[]) {
  return items.map((it) => (it.kind === 'sep' ? it.text : serializePieces(it.pieces))).join('');
}

/** Item indices of the segments, in order. */
export function segmentIndices(items: Item[]) {
  const out: number[] = [];
  items.forEach((it, i) => {
    if (it.kind === 'seg') out.push(i);
  });
  return out;
}

/** Moves segment `from` so it ends up at position `to` (both segment ordinals). Separators stay put. */
export function moveSegment(items: Item[], from: number, to: number): Item[] {
  const slots = segmentIndices(items);
  if (from === to || from < 0 || from >= slots.length) return items;
  const segs = slots.map((i) => items[i]);
  const [moved] = segs.splice(from, 1);
  segs.splice(Math.max(0, Math.min(to, segs.length)), 0, moved);
  const out = items.slice();
  slots.forEach((itemIndex, k) => {
    out[itemIndex] = segs[k];
  });
  return out;
}

/** Removes a segment and one neighbouring separator, keeping a folder break ('/') if there is one. */
export function removeSegment(items: Item[], ord: number): Item[] {
  const idx = segmentIndices(items)[ord];
  if (idx === undefined) return items;
  const before = items[idx - 1];
  const after = items[idx + 1];
  let start = idx;
  let end = idx + 1;
  const hasBefore = before?.kind === 'sep' && idx - 1 > 0;
  const hasAfter = after?.kind === 'sep' && idx + 1 < items.length - 1;
  if (hasBefore && hasAfter) {
    // Drop the weaker separator so "A/B_C" minus B is "A/C", not "A_C".
    if (before.text.includes('/') && !after.text.includes('/')) end++;
    else start--;
  } else if (hasBefore) {
    start--;
  } else if (hasAfter) {
    end++;
  }
  return [...items.slice(0, start), ...items.slice(end)];
}

/**
 * Inserts a segment after segment `afterOrd` (or at the end when null),
 * separated from its neighbour by `sep`.
 */
export function insertSegment(
  items: Item[],
  pieces: Piece[],
  sep: string,
  afterOrd: number | null,
): { items: Item[]; ord: number } {
  const slots = segmentIndices(items);
  const seg: Item = { kind: 'seg', pieces };
  if (slots.length === 0) {
    return { items: [...items, seg], ord: 0 };
  }
  if (afterOrd === null || afterOrd >= slots.length - 1) {
    const lastIdx = slots[slots.length - 1];
    // Keep any trailing separator run at the very end.
    return {
      items: [...items.slice(0, lastIdx + 1), { kind: 'sep', text: sep }, seg, ...items.slice(lastIdx + 1)],
      ord: slots.length,
    };
  }
  const at = slots[afterOrd] + 1;
  return {
    items: [...items.slice(0, at), { kind: 'sep', text: sep }, seg, ...items.slice(at)],
    ord: afterOrd + 1,
  };
}

/**
 * A segment as alternating text and token slots: texts.length === tokens.length + 1.
 * Empty texts stand for "no text here", so the inspector can show a field for each gap.
 */
export interface Slots {
  texts: string[];
  tokens: { name: string; format?: string }[];
}

export function toSlots(pieces: Piece[]): Slots {
  const texts = [''];
  const tokens: Slots['tokens'] = [];
  for (const p of pieces) {
    if (p.kind === 'text') texts[texts.length - 1] += p.text;
    else {
      tokens.push({ name: p.name, format: p.format });
      texts.push('');
    }
  }
  return { texts, tokens };
}

export function fromSlots({ texts, tokens }: Slots): Piece[] {
  const out: Piece[] = [];
  texts.forEach((text, i) => {
    if (text) out.push({ kind: 'text', text });
    const t = tokens[i];
    if (t) out.push({ kind: 'token', name: t.name, format: t.format });
  });
  return out;
}

/**
 * Characters a part's text can't hold: '_' and space split parts, '/' starts a
 * folder level (the app turns it into '_' in file names), braces start tokens.
 */
export function stripReserved(text: string) {
  return text.replace(/[_ /{}]/g, '');
}

/** Rewrites `{from}` / `{from:fmt}` to `{to}` / `{to:fmt}`. */
export function renameToken(template: string, from: string, to: string) {
  return template.replace(TOKEN_RE, (whole, name: string, format?: string) =>
    name === from ? tokenText(to, format) : whole,
  );
}

/** Brace groups the renderer won't treat as tokens (they're kept as text). */
export function bracesThatArentTokens(template: string): string[] {
  const stripped = template.replace(TOKEN_RE, '');
  return stripped.match(/\{[^{}]*\}?|\}/g) ?? [];
}

// Editor-side warnings about naming templates. These don't block export; they
// point out names that won't come out the way the person probably expects.
import { templateTokens } from './naming';
import type { Draft } from './profile';
import { BUILT_IN_TOKENS } from './schema';
import { bracesThatArentTokens } from './template-model';
import { isDateToken, isValidDatePattern } from './tokens';

export type CaptureKind = 'snapshot' | 'video';
export type TemplateKind = 'folder' | 'file';

export interface TemplateWarning {
  text: string;
}

const FORBIDDEN_LITERAL = /[\\:*?"<>|\u0000-\u001f\u007f]/g;

export function knownTokens(draft: Draft): string[] {
  return [...BUILT_IN_TOKENS, ...draft.slate.customFields.map((f) => f.key)];
}

export function templateWarnings(
  template: string,
  kind: TemplateKind,
  capture: CaptureKind,
  draft: Draft,
): TemplateWarning[] {
  const out: TemplateWarning[] = [];
  const known = new Set(knownTokens(draft));
  const tokens = templateTokens(template);

  for (const name of new Set(tokens.map((t) => t.name).filter((n) => !known.has(n)))) {
    out.push({ text: `{${name}} isn't a token or a custom field, so the part it's in is always left out.` });
  }
  for (const b of new Set(bracesThatArentTokens(template))) {
    out.push({ text: `“${b}” isn't a token (tokens are lowercase), so it's written as is.` });
  }
  for (const t of tokens) {
    if (t.format === null) continue;
    const raw = `{${t.name}:${t.format}}`;
    if (isDateToken(t.name)) {
      if (!isValidDatePattern(t.format)) {
        out.push({
          text: `${raw}: only YYYY, YY, MM, DD, HH, mm and ss are replaced; anything else is written as is. Stick to - . _ between them.`,
        });
      }
    } else if (!/^0[1-9]$/.test(t.format)) {
      out.push({ text: `${raw} is ignored. Only Date and Time take a pattern; other tokens take 01 to 09 to pad numbers with zeros.` });
    }
  }

  const literal = template.replace(/\{[a-z][a-z0-9]*(?::[^}]*)?\}/g, '');
  const forbidden = new Set(literal.match(FORBIDDEN_LITERAL) ?? []);
  if (forbidden.size) {
    const list = [...forbidden].map((c) => (c < ' ' ? 'control characters' : `“${c}”`)).join(', ');
    out.push({ text: `${list} can't be in file names; devices write “-” instead.` });
  }
  if (kind === 'file' && literal.includes('/')) {
    out.push({ text: 'A “/” in a name becomes “_”. Put folders in the folder template.' });
  }
  const levels = kind === 'folder' ? template.split('/') : [template];
  if (levels.some((l) => /^\s*\./.test(l))) {
    out.push({ text: 'Names can’t start with a dot; devices drop it (and a folder of just “.” or “..” is left out).' });
  }

  if (kind === 'file') {
    const names = new Set(tokens.map((t) => t.name));
    const what = capture === 'snapshot' ? 'snapshots' : 'recordings';
    if (!names.has('take') && !names.has('seq') && !names.has('time')) {
      out.push({
        text: `Nothing in this name changes between ${what} (no Take, Counter or Time), so repeats get _v2, _v3 added.`,
      });
    } else if (
      capture === 'snapshot' &&
      names.has('take') &&
      !names.has('seq') &&
      !names.has('time') &&
      !draft.slate.snapshotsAdvanceTake
    ) {
      out.push({
        text: "Snapshots don't advance the take (see Slate), so several snapshots in one take get _v2, _v3. Add Counter or Time to tell them apart.",
      });
    }
  }
  return out;
}

export const TEMPLATE_IDS = [
  { capture: 'snapshot', kind: 'folder' },
  { capture: 'snapshot', kind: 'file' },
  { capture: 'video', kind: 'folder' },
  { capture: 'video', kind: 'file' },
] as const;

export function namingWarningCount(draft: Draft): number {
  return TEMPLATE_IDS.reduce(
    (n, { capture, kind }) => n + templateWarnings(draft.naming[capture][kind], kind, capture, draft).length,
    0,
  );
}

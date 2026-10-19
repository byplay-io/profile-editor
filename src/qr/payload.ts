// Profile <-> QR payloads. Spec: docs/production-profile.md ("QR codes").
//
//   data   = base45(zlib(utf8(JSON)))
//   single = "BPP1:" + data
//   parts  = "BPP1P:<i>/<n>/<tag>:" + chunk, n <= 16, tag = 4 chars [0-9A-Z]
import { unzlibSync, zlibSync } from 'fflate';
import { BASE45_ALPHABET, base45Decode, base45Encode } from './base45';

export const QR_SINGLE_PREFIX = 'BPP1:';
export const QR_PART_PREFIX = 'BPP1P:';
export const QR_MAX_PARTS = 16;
// About QR version 20 at error correction M: still readable off a laptop
// screen or a printed page by a device camera.
export const QR_MAX_CHARS = 1000;

const PART_RE = /^BPP1P:(\d{1,2})\/(\d{1,2})\/([0-9A-Z]{4}):(.*)$/s;
const TAG_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class QrTooLargeError extends Error {
  constructor(public readonly dataLength: number) {
    super(`The profile needs more than ${QR_MAX_PARTS} QR codes`);
  }
}

/** base45(zlib(utf8(JSON))) of a profile object. */
export function profileToQrData(profile: unknown): string {
  const json = JSON.stringify(profile);
  return base45Encode(zlibSync(new TextEncoder().encode(json), { level: 9 }));
}

export function qrDataToJson(data: string): unknown {
  const bytes = unzlibSync(base45Decode(data));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function randomTag(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TAG_ALPHABET[b % TAG_ALPHABET.length]).join('');
}

/**
 * Splits QR data into as few payloads as fit `maxChars` each: one "BPP1:" code
 * when it fits, otherwise n equal-sized "BPP1P:" parts.
 */
export function splitQrData(
  data: string,
  { maxChars = QR_MAX_CHARS, tag = randomTag(), minParts = 1 } = {},
): string[] {
  if (minParts <= 1 && QR_SINGLE_PREFIX.length + data.length <= maxChars) {
    return [QR_SINGLE_PREFIX + data];
  }
  for (let n = Math.max(2, minParts); n <= QR_MAX_PARTS; n++) {
    // The longest header for this n: "BPP1P:" + "n/n/" + tag + ":".
    const header = `${QR_PART_PREFIX}${n}/${n}/${tag}:`.length;
    if (header + Math.ceil(data.length / n) > maxChars) continue;
    const base = Math.floor(data.length / n);
    const extra = data.length % n;
    const parts: string[] = [];
    let offset = 0;
    for (let i = 1; i <= n; i++) {
      const size = base + (i <= extra ? 1 : 0);
      parts.push(`${QR_PART_PREFIX}${i}/${n}/${tag}:${data.slice(offset, offset + size)}`);
      offset += size;
    }
    return parts;
  }
  throw new QrTooLargeError(data.length);
}

export function encodeProfileQr(profile: unknown, options?: Parameters<typeof splitQrData>[1]) {
  return splitQrData(profileToQrData(profile), options);
}

/**
 * Joins scanned payloads (in any order) and decodes the profile JSON.
 * Payloads must not be trimmed: space is a base45 character, so a chunk can
 * start or end with one.
 */
export function decodeQrPayloads(payloads: string[]): unknown {
  const codes = payloads.filter((p) => p !== '');
  if (codes.length === 1 && codes[0].startsWith(QR_SINGLE_PREFIX)) {
    return qrDataToJson(codes[0].slice(QR_SINGLE_PREFIX.length));
  }
  let total = 0;
  let tag = '';
  const chunks = new Map<number, string>();
  for (const code of codes) {
    const m = PART_RE.exec(code);
    if (!m) throw new Error(`Not a profile QR code: ${code.slice(0, 16)}…`);
    const [, i, n, partTag, chunk] = m;
    if (total === 0) {
      total = Number(n);
      tag = partTag;
    }
    if (Number(n) !== total || partTag !== tag) {
      throw new Error('These codes come from different profiles or encodings');
    }
    const index = Number(i);
    if (index < 1 || index > total || total > QR_MAX_PARTS) {
      throw new Error(`Bad part number ${i}/${n}`);
    }
    chunks.set(index, chunk);
  }
  if (total === 0 || chunks.size !== total) {
    throw new Error(`Have ${chunks.size} of ${total} parts`);
  }
  let data = '';
  for (let i = 1; i <= total; i++) data += chunks.get(i);
  return qrDataToJson(data);
}

export function isQrAlphanumeric(text: string): boolean {
  for (const c of text) {
    if (!BASE45_ALPHABET.includes(c)) return false;
  }
  return true;
}

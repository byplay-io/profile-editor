// Base45 (RFC 9285). Its alphabet is exactly the QR alphanumeric character set,
// so a base45 string can be encoded in a QR code's dense alphanumeric mode.

export const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const VALUES = new Map(Array.from(BASE45_ALPHABET, (c, i) => [c, i]));

export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i] * 256 + bytes[i + 1];
    out +=
      BASE45_ALPHABET[n % 45] +
      BASE45_ALPHABET[Math.floor(n / 45) % 45] +
      BASE45_ALPHABET[Math.floor(n / 2025)];
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1];
    out += BASE45_ALPHABET[n % 45] + BASE45_ALPHABET[Math.floor(n / 45)];
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  if (text.length % 3 === 1) {
    throw new Error('Base45 data has a stray character at the end');
  }
  const digits = Array.from(text, (c) => {
    const v = VALUES.get(c);
    if (v === undefined) {
      throw new Error(`Base45 data contains "${c}", which isn't in the alphabet`);
    }
    return v;
  });
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < digits.length; i += 3) {
    if (i + 2 < digits.length) {
      const n = digits[i] + digits[i + 1] * 45 + digits[i + 2] * 2025;
      if (n > 0xffff) throw new Error('Base45 group out of range');
      out[o++] = n >> 8;
      out[o++] = n & 0xff;
    } else {
      const n = digits[i] + digits[i + 1] * 45;
      if (n > 0xff) throw new Error('Base45 group out of range');
      out[o++] = n;
    }
  }
  return out;
}

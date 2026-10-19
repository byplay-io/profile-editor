import { create } from 'qrcode';

export interface QrMatrix {
  /** Modules per side, without the quiet zone. */
  size: number;
  version: number;
  /** SVG path for the dark modules, offset by the quiet zone. */
  path: string;
  /** Side length including the quiet zone, for the SVG viewBox. */
  extent: number;
}

const QUIET_ZONE = 4;

/** Encodes a payload in alphanumeric mode at error correction level M. */
export function qrMatrix(payload: string): QrMatrix {
  const qr = create([{ data: payload, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' });
  const { size, data } = qr.modules;
  // One horizontal run per path command keeps the path short and the edges crisp.
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      path += `M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${x - start}v1h${start - x}z`;
    }
  }
  return { size, version: qr.version, path, extent: size + QUIET_ZONE * 2 };
}

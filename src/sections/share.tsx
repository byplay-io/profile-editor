import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ReadableIssue } from '../profile';
import { qrMatrix, type QrMatrix } from '../qr/matrix';
import { encodeProfileQr, QR_MAX_PARTS, QrTooLargeError } from '../qr/payload';
import type { ProductionProfile } from '../schema';
import { Button, Icon, IconButton, Notice, Section, Segmented } from '../ui';
import { formatUpdatedAt } from './basics';

export const SCAN_INSTRUCTION = 'In Byplay Previz: Settings → Production → Scan code';

const SECTION_OF: [string, string][] = [
  ['naming', 'naming'],
  ['slate', 'slate'],
  ['capture', 'capture'],
  ['optics', 'kit'],
];

export function sectionForPath(path: string) {
  return SECTION_OF.find(([prefix]) => path === prefix || path.startsWith(`${prefix}.`))?.[1] ?? 'production';
}

export type QrCodes = { ok: true; payloads: string[]; chars: number } | { ok: false; message: string };

/** QR payloads for a profile: cheap enough to keep current while editing. */
export function useQrCodes(profile: ProductionProfile | null): QrCodes | null {
  const json = profile ? JSON.stringify(profile) : null;
  return useMemo(() => {
    if (!profile) return null;
    try {
      const payloads = encodeProfileQr(profile);
      return { ok: true, payloads, chars: payloads.reduce((n, p) => n + p.length, 0) };
    } catch (e) {
      return {
        ok: false,
        message:
          e instanceof QrTooLargeError
            ? `This profile is too big for ${QR_MAX_PARTS} QR codes. Share it as a file, or trim the camera kit.`
            : 'Couldn’t make QR codes for this profile.',
      };
    }
    // The JSON string is the identity: same content, same codes (and tag).
  }, [json]);
}

export function ShareSection({
  profile,
  qr,
  issues,
  bumped,
  previousRevision,
  downloaded,
  canShareFile,
  onDownload,
  onShareFile,
  onShowQr,
}: {
  profile: ProductionProfile | null;
  qr: QrCodes | null;
  issues: ReadableIssue[];
  bumped: boolean;
  previousRevision: number | null;
  downloaded: boolean;
  canShareFile: boolean;
  onDownload: () => void;
  onShareFile: () => void;
  onShowQr: () => void;
}) {
  return (
    <Section id="share" title="Share" description="Get the profile onto the crew’s devices.">
      {!profile ? (
        <div class="issues">
          <Notice tone="error">
            <p>Fix {issues.length === 1 ? 'this' : 'these'} before sharing:</p>
            <ul class="issue-list">
              {issues.map((i) => (
                <li key={i.path + i.message}>
                  <a href={`#${sectionForPath(i.path)}`}>{i.label}</a> {i.message}.
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      ) : (
        <>
          <div class="share-status">
            <div class="readout readout-compact">
              <span class="readout-label">Ready to share</span>
              <p class="readout-path">
                <span class="readout-file">{profile.project}</span>
                {profile.title && <span class="readout-dim"> · {profile.title}</span>}
                <span class="readout-dim"> · revision </span>
                <span class="readout-file num">{profile.revision}</span>
              </p>
            </div>
            <p class="muted small">
              {bumped && previousRevision !== null
                ? `You've made changes, so this is revision ${profile.revision}. Devices with revision ${previousRevision} will replace it when they import this one.`
                : previousRevision === null
                  ? 'A new profile. Devices add it alongside any profiles they already have.'
                  : `No changes since revision ${profile.revision}. Devices that already have it will keep their copy.`}
              {downloaded ? ' This version is downloaded.' : ''}
            </p>
          </div>
          <div class="share-grid">
            <div class="share-card">
              <h3>As a file</h3>
              <p class="muted small">
                Saves <span class="mono">{profile.project}.bpprod</span>. On iPad it goes to the Files app. Send it to
                each device by AirDrop or any file transfer and open it there in Byplay Previz. Keep the file: open it
                here next time to make changes.
              </p>
              <div class="row-gap">
                <Button variant="primary" icon="download" onClick={onDownload}>
                  Download profile
                </Button>
                {canShareFile && (
                  <Button icon="share" onClick={onShareFile}>
                    Share…
                  </Button>
                )}
              </div>
            </div>
            <div class="share-card">
              <h3>As QR codes</h3>
              <p class="muted small">
                For managed iPads that block downloads and AirDrop. {SCAN_INSTRUCTION}, and point the device at your
                screen or a printout.
                {qr?.ok && ` This profile needs ${qr.payloads.length === 1 ? 'one code' : `${qr.payloads.length} codes`}.`}
              </p>
              {qr && !qr.ok ? (
                <Notice>{qr.message}</Notice>
              ) : (
                <div class="row-gap">
                  <Button icon="qr" onClick={onShowQr}>
                    Show QR codes
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

function QrSvg({ m, label }: { m: QrMatrix; label: string }) {
  return (
    <svg class="qr" viewBox={`0 0 ${m.extent} ${m.extent}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect width={m.extent} height={m.extent} fill="#fff" />
      <path d={m.path} fill="#000" />
    </svg>
  );
}

type ReadyCodes = Extract<QrCodes, { ok: true }> & { matrices: QrMatrix[] };

export function withMatrices(qr: Extract<QrCodes, { ok: true }>): ReadyCodes {
  return { ...qr, matrices: qr.payloads.map(qrMatrix) };
}

export function QrDialog({
  profile,
  qr,
  onClose,
}: {
  profile: ProductionProfile;
  qr: ReadyCodes;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const n = qr.payloads.length;
  const [mode, setMode] = useState<'cycle' | 'all'>('cycle');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.open && d.close();
  }, []);

  useEffect(() => {
    if (mode !== 'cycle' || paused || n < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % n), 1000);
    return () => window.clearInterval(t);
  }, [mode, paused, n]);

  const i = Math.min(index, n - 1);
  return (
    <dialog
      ref={ref}
      class="qr-dialog"
      aria-labelledby="qr-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div class="qr-dialog-inner">
        <header class="qr-head">
          <div>
            <h2 id="qr-title">Scan to load the profile</h2>
            <p class="muted small">
              {profile.project}
              {profile.title ? ` · ${profile.title}` : ''} · revision {profile.revision}
            </p>
          </div>
          <IconButton icon="x" label="Close" onClick={() => ref.current?.close()} />
        </header>
        <div class="qr-body">
          {mode === 'cycle' || n === 1 ? (
            <div class="qr-stage">
              <QrSvg m={qr.matrices[i]} label={n > 1 ? `QR code, part ${i + 1} of ${n}` : 'QR code'} />
              {n > 1 && (
                <div class="qr-controls">
                  <IconButton icon="left" label="Previous part" onClick={() => setIndex((i - 1 + n) % n)} />
                  <span class="qr-part num" aria-live={paused ? 'polite' : 'off'}>
                    Part {i + 1} of {n}
                  </span>
                  <IconButton icon="right" label="Next part" onClick={() => setIndex((i + 1) % n)} />
                  <IconButton icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)} />
                </div>
              )}
            </div>
          ) : (
            <div class="qr-all">
              {qr.matrices.map((m, k) => (
                <figure key={k}>
                  <QrSvg m={m} label={`QR code, part ${k + 1} of ${n}`} />
                  <figcaption class="num">
                    Part {k + 1} of {n}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <div class="qr-side">
            <ol class="steps">
              <li>{SCAN_INSTRUCTION}.</li>
              <li>
                {n > 1
                  ? `Point it at the screen. The ${n} codes take turns; the device collects them in any order.`
                  : 'Point it at the screen.'}
              </li>
              <li>Check the profile it shows, and confirm.</li>
            </ol>
            {n > 1 && (
              <Segmented
                label="Layout"
                value={mode}
                options={[
                  { value: 'cycle', label: 'One at a time' },
                  { value: 'all', label: 'Show all' },
                ]}
                onChange={setMode}
              />
            )}
            <p class="muted small num">
              {n === 1 ? 'One code' : `${n} codes`}, {qr.chars.toLocaleString('en-US')} characters, error correction M.
            </p>
            <Button icon="print" onClick={() => window.print()}>
              Print codes
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export function PrintSheet({ profile, qr }: { profile: ProductionProfile; qr: ReadyCodes }) {
  const n = qr.payloads.length;
  return (
    <div class={`print-sheet ${n === 1 ? 'print-single' : ''}`} aria-hidden="true">
      <header class="print-head">
        <p class="print-brand">Byplay Previs production profile</p>
        <h1>
          {profile.project}
          {profile.title && <span> · {profile.title}</span>}
        </h1>
        <p>
          Revision {profile.revision} · {formatUpdatedAt(profile.updatedAt)}
          {n > 1 ? ` · ${n} codes, scan all of them in any order` : ''}
        </p>
        <p class="print-instruction">{SCAN_INSTRUCTION}</p>
      </header>
      <div class="print-codes">
        {qr.matrices.map((m, k) => (
          <figure class="print-code" key={k}>
            <QrSvg m={m} label="" />
            <figcaption>
              {profile.project} · revision {profile.revision}
              {n > 1 ? ` · part ${k + 1} of ${n}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
      <p class="print-foot">
        <Icon name="lock" size={12} /> Made in the browser with the Byplay Previs profile editor. Nothing was uploaded.
      </p>
    </div>
  );
}

import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { EditorContext, type EditorContextValue, initialSample, type SampleSlate } from './editor';
import { namingWarningCount } from './naming-checks';
import {
  contentKey,
  type Draft,
  draftFromProfile,
  exportProfile,
  newDraft,
  type OpenResult,
  parseProfileText,
  profileFileName,
  profileJson,
  type ReadableIssue,
  type RevisionBase,
  readableIssues,
  toProfileInput,
  validateDraft,
} from './profile';
import type { ProductionProfile } from './schema';
import { CaptureSection, ProductionSection, SlateSection } from './sections/basics';
import { KitSection } from './sections/kit';
import { NamingSection } from './sections/naming';
import { PrintSheet, QrDialog, ShareSection, sectionForPath, useQrCodes, withMatrices } from './sections/share';
import { tokenCatalog } from './tokens';
import { Button, Icon, Notice } from './ui';

const OFFLINE_PATH = '/byplay-profile-editor-offline.html';

interface Session {
  draft: Draft;
  /** What the next export's revision is measured against; null for a never-shared new profile. */
  base: RevisionBase | null;
  /** Content when created or opened, and when last downloaded: leaving with either is safe. */
  pristineKey: string;
  downloadedKey: string | null;
  /** Keys in the opened file that this editor doesn't know (dropped on export). */
  droppedKeys: string[];
}

function keyOf(draft: Draft) {
  return contentKey(toProfileInput(draft) as object);
}

function newSession(draft: Draft, base: RevisionBase | null, droppedKeys: string[] = []): Session {
  return { draft, base, pristineKey: keyOf(draft), downloadedKey: null, droppedKeys };
}

// iOS file pickers grey out files whose extension they don't know, so offer everything there.
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sample, setSampleState] = useState<SampleSlate>(initialSample);
  const [openError, setOpenError] = useState<Extract<OpenResult, { ok: false }> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const draft = session?.draft ?? null;
  const validation = useMemo(() => (draft ? validateDraft(draft) : null), [draft]);
  const key = draft ? keyOf(draft) : '';
  // One timestamp per distinct content, so the QR codes don't change every second.
  const stamp = useMemo(() => new Date().toISOString(), [key]);
  const exportReady: ProductionProfile | null = useMemo(
    () => (validation?.ok && session ? exportProfile(validation.profile, session.base, stamp) : null),
    [validation, session?.base, stamp],
  );
  const issues: ReadableIssue[] = useMemo(
    () => (validation && !validation.ok ? readableIssues(validation.issues, draft) : []),
    [validation],
  );
  const dirty = !!session && key !== session.pristineKey && key !== session.downloadedKey;
  const qr = useQrCodes(exportReady);
  // Drawing the codes is the slow part, so only while they're on screen.
  const readyCodes = useMemo(() => (qrOpen && qr?.ok ? withMatrices(qr) : null), [qrOpen, qr]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = useCallback((recipe: (d: Draft) => void) => {
    setSession((s) => {
      if (!s) return s;
      const d = structuredClone(s.draft);
      recipe(d);
      return { ...s, draft: d };
    });
  }, []);
  const setSample = useCallback((recipe: (s: SampleSlate) => void) => {
    setSampleState((s) => {
      const next = structuredClone(s);
      recipe(next);
      return next;
    });
  }, []);

  const confirmDiscard = () =>
    !dirty || window.confirm("Your changes to this profile haven't been downloaded. Discard them?");

  const startNew = () => {
    if (!confirmDiscard()) return;
    setOpenError(null);
    setSession(newSession(newDraft(), null));
    window.scrollTo(0, 0);
  };

  const openText = (text: string) => {
    const r = parseProfileText(text);
    if (!r.ok) {
      setOpenError(r);
      return;
    }
    if (!confirmDiscard()) return;
    setOpenError(null);
    const draftNew = draftFromProfile(r.profile);
    setSession(
      newSession(
        draftNew,
        { revision: r.profile.revision, updatedAt: r.profile.updatedAt, key: contentKey(r.profile) },
        r.unknownKeys,
      ),
    );
    window.scrollTo(0, 0);
  };
  const openFile = async (file: File) => {
    if (file.size > 1_000_000) {
      setOpenError({ ok: false, title: "This file is too big to be a production profile.", issues: [] });
      return;
    }
    openText(await file.text());
  };

  // Drop a .bpprod anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void openFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  /** Marks the current content as shared at exportReady's revision. */
  const commitExport = (downloaded: boolean) => {
    if (!exportReady) return;
    const base = { revision: exportReady.revision, updatedAt: exportReady.updatedAt, key: contentKey(exportReady) };
    setSession((s) =>
      s && {
        ...s,
        draft: { ...s.draft, revision: base.revision, updatedAt: base.updatedAt },
        base,
        downloadedKey: downloaded ? key : s.downloadedKey,
      },
    );
  };

  const profileFile = () =>
    exportReady && new File([profileJson(exportReady)], profileFileName(exportReady), { type: 'application/octet-stream' });

  const download = () => {
    const file = profileFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    commitExport(true);
  };

  const canShareFile = useMemo(() => {
    try {
      const probe = new File(['{}'], 'probe.bpprod', { type: 'application/json' });
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }, []);
  const shareFile = async () => {
    const file = exportReady && new File([profileJson(exportReady)], profileFileName(exportReady), { type: 'application/json' });
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      commitExport(false);
    } catch {
      // Cancelled.
    }
  };

  const showQr = () => {
    if (!qr?.ok) return;
    // Showing codes is a way of sharing: lock in this revision so later edits bump it again.
    commitExport(false);
    setQrOpen(true);
  };

  const picker = (
    <input
      ref={fileInput}
      type="file"
      class="visually-hidden"
      tabIndex={-1}
      accept={isIOS ? undefined : '.bpprod,.json,application/json'}
      onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (f) void openFile(f);
      }}
    />
  );
  const openPicker = () => fileInput.current?.click();

  const errorBox = openError && (
    <div class="open-error">
      <Notice tone="error">
        <p>
          <strong>{openError.title}</strong>
        </p>
        {openError.issues.length > 0 && (
          <ul class="issue-list">
            {openError.issues.slice(0, 12).map((i) => (
              <li key={i.path + i.message}>
                {i.label} {i.message}.
              </li>
            ))}
            {openError.issues.length > 12 && <li>…and {openError.issues.length - 12} more.</li>}
          </ul>
        )}
      </Notice>
    </div>
  );

  const dropOverlay = dragging && (
    <div class="drop-overlay" aria-hidden="true">
      <div>
        <Icon name="open" size={32} />
        <p>Drop the profile to open it</p>
      </div>
    </div>
  );

  if (!session || !draft || !validation) {
    return (
      <>
        <StartScreen onNew={startNew} onOpen={openPicker} error={errorBox} />
        {picker}
        {dropOverlay}
      </>
    );
  }

  const ctx: EditorContextValue = {
    draft,
    update,
    issues,
    catalog: tokenCatalog(draft.slate.customFields),
    sample,
    setSample,
  };
  const revision = exportReady?.revision ?? (session.base ? session.base.revision + (key !== session.base.key ? 1 : 0) : 1);
  const errorCount = (section: string) => issues.filter((i) => sectionForPath(i.path) === section).length;
  const namingWarnings = namingWarningCount(draft);
  const nav: { id: string; label: string; errors: number; warnings?: number }[] = [
    { id: 'production', label: 'Production', errors: errorCount('production') },
    { id: 'naming', label: 'Naming', errors: errorCount('naming'), warnings: namingWarnings },
    { id: 'slate', label: 'Slate', errors: errorCount('slate') },
    { id: 'capture', label: 'Capture', errors: errorCount('capture') },
    { id: 'kit', label: 'Camera kit', errors: errorCount('kit') },
    { id: 'share', label: 'Share', errors: 0 },
  ];

  return (
    <EditorContext.Provider value={ctx}>
      <div class="app">
        <header class="topbar">
          <div class="topbar-inner">
            <Brand />
            <div class="doc-status">
              <span class="doc-name">{draft.project || 'Untitled profile'}</span>
              <span class="doc-meta num">
                rev {revision}
                {dirty ? ' · not downloaded' : session.downloadedKey ? ' · downloaded' : ''}
              </span>
            </div>
            <div class="topbar-actions">
              <Button variant="on-teal-quiet" icon="file" class="hide-narrow-label" onClick={startNew} title="New profile">
                New
              </Button>
              <Button variant="on-teal-quiet" icon="open" class="hide-narrow-label" onClick={openPicker} title="Open profile">
                Open…
              </Button>
              <Button variant="on-teal-quiet" icon="qr" class="hide-narrow-label" disabled={!qr?.ok} onClick={showQr} title={qr && !qr.ok ? qr.message : 'Show QR codes'}>
                QR codes
              </Button>
              <Button variant="on-teal" icon="download" disabled={!exportReady} onClick={download} title="Download profile">
                Download
              </Button>
            </div>
          </div>
        </header>
        {errorBox}
        <div class="layout">
          <nav class="toc" aria-label="Sections">
            <ul>
              {nav.map((n) => (
                <li key={n.id}>
                  <a href={`#${n.id}`}>
                    <span>{n.label}</span>
                    {n.errors > 0 ? (
                      <span class="badge badge-error" title={`${n.errors} to fix`}>
                        {n.errors}
                      </span>
                    ) : n.warnings ? (
                      <span class="badge badge-warn" title={`${n.warnings} warnings`}>
                        {n.warnings}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
            <PrivacyNote compact />
          </nav>
          <main class="main" id="main">
            {session.droppedKeys.length > 0 && (
              <Notice>
                <p>
                  <strong>This file has settings this editor doesn't know</strong>, probably from a newer version:{' '}
                  <span class="mono">{session.droppedKeys.slice(0, 6).join(', ')}</span>
                  {session.droppedKeys.length > 6 ? ` and ${session.droppedKeys.length - 6} more` : ''}. Downloading or
                  sharing from here leaves them out. Reload the page{__OFFLINE__ ? ' online, or get a fresh offline copy,' : ''} to
                  get the latest editor.
                </p>
              </Notice>
            )}
            <ProductionSection revision={revision} />
            <NamingSection />
            <SlateSection />
            <CaptureSection />
            <KitSection />
            <ShareSection
              profile={exportReady}
              qr={qr}
              issues={issues}
              bumped={!!session.base && key !== session.base.key}
              previousRevision={session.base?.revision ?? null}
              downloaded={session.downloadedKey === key}
              canShareFile={canShareFile}
              onDownload={download}
              onShareFile={shareFile}
              onShowQr={showQr}
            />
            <footer class="footer">
              <PrivacyNote />
            </footer>
          </main>
        </div>
      </div>
      {qrOpen && exportReady && readyCodes && (
        <>
          <QrDialog profile={exportReady} qr={readyCodes} onClose={() => setQrOpen(false)} />
          <PrintSheet profile={exportReady} qr={readyCodes} />
        </>
      )}
      {picker}
      {dropOverlay}
    </EditorContext.Provider>
  );
}

function Brand() {
  return (
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" class="brand-mark-bg" />
        <path d="M16 16 L24.5 8.4" class="brand-mark-needle" />
        <circle cx="16" cy="16" r="2.4" class="brand-mark-dot" />
        <path d="M6.6 21.4 A 10.7 10.7 0 0 1 6.6 10.5 M9.6 25 A 10.7 10.7 0 0 1 5.5 16.4" class="brand-mark-arc" />
      </svg>
      <span class="brand-text">
        <span class="brand-name">Byplay Previs</span>
        <span class="brand-tool">Profile editor</span>
      </span>
    </div>
  );
}

function PrivacyNote({ compact }: { compact?: boolean }) {
  return (
    <div class={`privacy ${compact ? 'privacy-compact' : ''}`}>
      <p class="privacy-title">
        <Icon name="lock" size={16} /> Stays in this browser
      </p>
      <p>
        Nothing you type here leaves this device. The page has no server to send to, and its Content-Security-Policy
        blocks it from connecting anywhere. Nothing is stored either: close the tab and it's gone, so download the
        profile when you're done.
      </p>
      {__OFFLINE__ ? (
        <p>
          You're using the offline copy of this page. After an app update, get a fresh copy so newer profile settings
          aren't dropped.
        </p>
      ) : (
        <p>
          <a href={OFFLINE_PATH} download="byplay-profile-editor-offline.html">
            Use offline: download this page
          </a>{' '}
          as a single file that works without a connection. Get a fresh copy after app updates.
        </p>
      )}
    </div>
  );
}

function StartScreen({
  onNew,
  onOpen,
  error,
}: {
  onNew: () => void;
  onOpen: () => void;
  error: ComponentChildren;
}) {
  return (
    <div class="start">
      <header class="topbar topbar-start">
        <div class="topbar-inner">
          <Brand />
        </div>
      </header>
      <main class="start-main" id="main">
        <section class="start-hero">
          <h1>Production profile</h1>
          <p class="lead">
            One file that tells every device on your production how to name and file snapshots and recordings, which
            slate fields to fill in, and which cameras and lenses you're shooting with.
          </p>
          <div class="start-actions">
            <Button variant="on-teal" icon="file" onClick={onNew}>
              New profile
            </Button>
            <Button variant="on-teal-outline" icon="open" onClick={onOpen}>
              Open profile…
            </Button>
          </div>
          <p class="start-drop">Or drop a .bpprod file anywhere on this page.</p>
        </section>
        {error}
        <section class="start-notes">
          <div>
            <h2>Getting it onto devices</h2>
            <p>
              Download the .bpprod file and AirDrop it to each device, or show it as QR codes the devices scan: handy
              for managed iPads that block downloads and AirDrop.
            </p>
          </div>
          <div>
            <h2>Changing it later</h2>
            <p>
              Open the file here again and edit it. Each time you share an edited profile its revision goes up, and
              devices replace their copy without touching anyone's slate.
            </p>
          </div>
          <PrivacyNote />
        </section>
      </main>
    </div>
  );
}

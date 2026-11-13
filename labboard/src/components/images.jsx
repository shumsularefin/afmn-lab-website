import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { deleteImage, fmtBytes, imageUsage, isImageRef, listImages, resolveImage, uploadImage } from '../lib/images';
import { fmtDateTime } from '../lib/time';
import { Button, EmptyState, Icon, Input, Modal, Segmented, Spinner, cx } from './ui';

/** Hook: displayable src for a stored image value (reference or URL). */
export function useImageSrc(value) {
  const [src, setSrc] = useState(() => (value && !isImageRef(value) ? value : ''));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    if (!value) return setSrc('');
    resolveImage(value)
      .then((s) => live && setSrc(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [value]);
  return { src, failed, loading: Boolean(value) && !src && !failed };
}

/** <img> for a stored value, with a soft placeholder while it loads. */
export function LabImage({ value, alt = '', className, fallback = null, onClick }) {
  const { src, failed, loading } = useImageSrc(value);
  if (!value || failed) return fallback;
  if (loading) return <div className={cx('animate-pulse bg-slate-200/70 dark:bg-slate-800', className)} aria-hidden="true" />;
  const img = <img src={src} alt={alt} loading="lazy" decoding="async" className={cx('object-cover', className)} />;
  return onClick ? (
    <button type="button" onClick={onClick} className="block overflow-hidden rounded-[inherit]" aria-label={alt ? `Open ${alt}` : 'Open photo'}>
      {img}
    </button>
  ) : (
    img
  );
}

/** Full-screen photo viewer (Quick Look style). */
export function Lightbox({ value, onClose }) {
  const { src } = useImageSrc(value);
  useEffect(() => {
    if (!value) return undefined;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [value, onClose]);
  if (!value) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 animate-fade-in" onClick={onClose} role="dialog" aria-label="Photo">
      {src ? <img src={src} alt="" className="max-h-full max-w-full rounded-xl shadow-2xl animate-zoom-in" /> : <Spinner className="h-8 w-8 text-white" />}
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white backdrop-blur hover:bg-white/25" style={{ marginTop: 'env(safe-area-inset-top)' }} aria-label="Close">
        <Icon name="x" className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Picks files from the device, the camera (phones), a drop or a paste. */
function useFilePick(onFiles, { multiple = false } = {}) {
  const input = useRef(null);
  const camera = useRef(null);
  const [dragging, setDragging] = useState(false);
  const pick = (files) => {
    const list = [...(files || [])].filter((f) => /^image\//.test(f.type || 'image/'));
    if (list.length) onFiles(multiple ? list : list.slice(0, 1));
  };
  const inputs = (
    <>
      <input ref={input} type="file" accept="image/*" multiple={multiple} hidden onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
    </>
  );
  const dropProps = {
    onDragOver: (e) => (e.preventDefault(), setDragging(true)),
    onDragLeave: () => setDragging(false),
    onDrop: (e) => (e.preventDefault(), setDragging(false), pick(e.dataTransfer.files)),
    onPaste: (e) => pick(e.clipboardData?.files),
  };
  return { inputs, dropProps, dragging, browse: () => input.current?.click(), snap: () => camera.current?.click() };
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** One image (instrument photo). value is a reference or URL; onChange receives the new value. */
export function ImageField({ value, onChange, kind = 'instrument', label = 'Photo' }) {
  const { profile, isAdmin } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState(false);
  const upload = async ([file]) => {
    setBusy(true);
    try {
      onChange(await uploadImage(file, { kind, profile }));
      toast.success('Photo optimized and uploaded.');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const { inputs, dropProps, dragging, browse, snap } = useFilePick(upload);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <div
        {...dropProps}
        tabIndex={0}
        className={cx(
          'group relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition',
          dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 bg-slate-50 dark:border-white/15 dark:bg-white/[0.03]',
        )}
      >
        {value ? (
          <LabImage value={value} alt="Instrument photo" className="h-full w-full" fallback={<span className="text-sm text-slate-400">Image unavailable</span>} />
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 text-center text-slate-500">
            <Icon name="photo" className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium">Drop a photo here, paste, or browse</span>
            <span className="text-xs text-slate-400">Resized and compressed in your browser · no Cloud Storage needed</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/70 text-sm font-medium backdrop-blur-sm dark:bg-black/50">
            <Spinner className="h-4 w-4" /> Optimizing…
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={browse} disabled={busy}><Icon name="upload" className="h-4 w-4" /> {value ? 'Replace' : 'Upload'}</Button>
        {isTouch() && <Button size="sm" variant="secondary" onClick={snap} disabled={busy}><Icon name="camera" className="h-4 w-4" /> Camera</Button>}
        {isAdmin && <Button size="sm" variant="ghost" onClick={() => setLibrary(true)} disabled={busy}><Icon name="photos" className="h-4 w-4" /> Library</Button>}
        {value && <Button size="sm" variant="ghost" onClick={() => onChange('')} disabled={busy} className="text-rose-600 dark:text-rose-400">Remove</Button>}
      </div>
      {inputs}
      <Modal open={library} onClose={() => setLibrary(false)} title="Photo library" wide>
        <ImageLibrary onPick={(ref) => (onChange(ref), setLibrary(false))} />
      </Modal>
    </div>
  );
}

/** Up to `max` photos attached to a report. Thumbnails with remove buttons; camera on phones. */
export function PhotoAttachments({ value = [], onChange, max = 4, kind = 'issue' }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  const add = async (files) => {
    const room = Math.max(0, max - value.length);
    if (!room) return toast.info(`Up to ${max} photos.`);
    let next = [...value];
    setBusy(Math.min(room, files.length));
    for (const f of files.slice(0, room)) {
      try {
        next = [...next, await uploadImage(f, { kind, profile })];
        onChange(next);
      } catch (e) {
        toast.error(e);
      }
      setBusy((n) => n - 1);
    }
  };
  const { inputs, dropProps, browse, snap, dragging } = useFilePick(add, { multiple: true });
  return (
    <div {...dropProps} className={cx('rounded-xl transition', dragging && 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900')}>
      <div className="flex flex-wrap gap-2">
        {value.map((ref) => (
          <div key={ref} className="relative h-20 w-20 overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10">
            <LabImage value={ref} className="h-full w-full" />
            <button type="button" onClick={() => onChange(value.filter((r) => r !== ref))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white backdrop-blur" aria-label="Remove photo">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={i} className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/5"><Spinner className="h-5 w-5 text-slate-400" /></div>
        ))}
        {value.length + busy < max && (
          <>
            <button type="button" onClick={browse} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-white/15">
              <Icon name="photo" className="h-5 w-5" /> Add photo
            </button>
            {isTouch() && (
              <button type="button" onClick={snap} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-white/15">
                <Icon name="camera" className="h-5 w-5" /> Camera
              </button>
            )}
          </>
        )}
      </div>
      {inputs}
    </div>
  );
}

/** Thumbnails that open in the lightbox. */
export function PhotoStrip({ photos = [], size = 'h-16 w-16' }) {
  const [open, setOpen] = useState(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p} className={cx(size, 'overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10')}>
            <LabImage value={p} className={cx(size)} onClick={() => setOpen(p)} alt="Issue photo" />
          </div>
        ))}
      </div>
      <Lightbox value={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Admin photo library: every uploaded image, where it is used, and cleanup of unused ones. */
export function ImageLibrary({ onPick, instruments = null, issues = null }) {
  const { profile, isAdmin } = useAuth();
  const toast = useToast();
  const [images, setImages] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const known = Boolean(instruments && issues);
  const usage = useMemo(() => (known ? imageUsage(instruments, issues) : new Map()), [known, instruments, issues]);

  // One read per photo; done once when the library opens, not on every live update.
  async function load() {
    try {
      setImages(await listImages());
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (error) return <EmptyState icon="warning" title="Could not load photos">{error.message}</EmptyState>;
  if (!images) return <div className="flex justify-center py-10"><Spinner /></div>;

  const shown = images.filter((img) => {
    const used = usage.has(img.reference);
    if (filter === 'unused' && (!known || used)) return false;
    if (filter === 'used' && !used) return false;
    if (filter === 'instrument' || filter === 'issue') if (img.kind !== filter) return false;
    const hay = [img.name, img.createdByName, ...(usage.get(img.reference) || [])].join(' ').toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  });
  const unused = known ? images.filter((i) => !usage.has(i.reference)) : [];
  const total = images.reduce((n, i) => n + i.bytes, 0);

  async function remove(img) {
    if (!window.confirm(`Delete “${img.name}” permanently?${usage.has(img.reference) ? ' It is still shown on: ' + usage.get(img.reference).join(', ') : ''}`)) return;
    try {
      await deleteImage(img.id);
      setImages((l) => l.filter((x) => x.id !== img.id));
      toast.success('Photo deleted.');
    } catch (e) {
      toast.error(e);
    }
  }
  async function removeUnused() {
    if (!window.confirm(`Delete ${unused.length} photo(s) that nothing uses?`)) return;
    for (const img of unused) await deleteImage(img.id).catch(() => {});
    toast.success(`Removed ${unused.length} unused photo(s).`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search photos" className="!pl-8" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            ...(known ? [{ value: 'used', label: 'In use' }, { value: 'unused', label: `Unused${unused.length ? ` (${unused.length})` : ''}` }] : []),
            { value: 'instrument', label: 'Instruments' },
            { value: 'issue', label: 'Issues' },
          ]}
        />
      </div>
      <p className="text-xs text-slate-500">
        {images.length} photo{images.length === 1 ? '' : 's'} · {fmtBytes(total)} of Firestore storage (1 GB free). Photos are stored as compressed JPEGs in the database because the Spark plan has no Cloud Storage.
        {known && unused.length > 0 && isAdmin && (
          <button onClick={removeUnused} className="ml-2 font-medium text-rose-600 hover:underline">Delete {unused.length} unused</button>
        )}
      </p>
      {!shown.length ? (
        <EmptyState icon="photo" title={images.length ? 'No photos match' : 'No photos uploaded yet'} />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {shown.map((img) => {
            const uses = usage.get(img.reference) || [];
            return (
              <figure key={img.id} className="group min-w-0">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
                  <button type="button" onClick={() => (onPick ? onPick(img.reference) : setOpen(img.reference))} className="h-full w-full" title={img.name}>
                    <img src={img.image} alt={img.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                  </button>
                  {(isAdmin || img.createdBy === profile.uid) && !onPick && (
                    <button onClick={() => remove(img)} className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100" aria-label="Delete photo">
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <figcaption className="mt-1 truncate text-xs text-slate-500" title={`${img.name} · ${img.createdByName} · ${fmtDateTime(img.createdAt)}`}>
                  {known ? (uses.length ? <span className="text-slate-700 dark:text-slate-300">{uses[0]}{uses.length > 1 && ` +${uses.length - 1}`}</span> : <span className="text-amber-600">Unused</span>) : img.name}
                  <span className="block truncate text-slate-400">{fmtBytes(img.bytes)} · {img.createdByName}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
      <Lightbox value={open} onClose={() => setOpen(null)} />
    </div>
  );
}

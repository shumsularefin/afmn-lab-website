import { useState } from 'react';
import { Button, Field, Icon, Modal, Segmented, Textarea } from './ui';
import { PhotoAttachments } from './images';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { reportIssue } from '../lib/data';

export function IssueButton({ instrument, compact }) {
  const { profile, isApproved } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  if (!isApproved) return null;

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await reportIssue({ instrument, profile, description: text, severity, photos });
      toast.success('Issue reported. Admins will see it in the admin panel.');
      setOpen(false);
      setText('');
      setPhotos([]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Report an issue"
        className={
          compact
            ? 'rounded-full p-1.5 text-slate-400 transition hover:bg-orange-500/10 hover:text-orange-500'
            : 'inline-flex h-9 items-center gap-1.5 rounded-full bg-orange-500/10 px-4 text-[13px] font-semibold text-orange-600 transition hover:bg-orange-500/15 dark:text-orange-400 lg:h-8'
        }
      >
        <Icon name="flag" className="h-4 w-4" />
        {!compact && 'Report issue'}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Report an issue – ${instrument.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy} disabled={!text.trim()}>Send report</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="What's wrong?">
            <Textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Stage drifts after 20 min, error E42 on startup…" />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Severity</span>
            <Segmented
              value={severity}
              onChange={setSeverity}
              className="flex w-full [&>button]:flex-1"
              options={[{ value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }, { value: 'critical', label: 'Critical' }]}
            />
            <span className="mt-1.5 block text-xs text-slate-500">
              {{ minor: 'Still usable.', major: 'Results may be affected.', critical: 'Do not use – admins can take it out of service.' }[severity]}
            </span>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Photos <span className="font-normal text-slate-400">(optional, up to 4)</span></span>
            <PhotoAttachments value={photos} onChange={setPhotos} />
          </div>
        </div>
      </Modal>
    </>
  );
}

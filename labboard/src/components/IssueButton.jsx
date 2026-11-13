import { useState } from 'react';
import { Button, Field, Icon, Modal, Select, Textarea } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { reportIssue } from '../lib/data';

export function IssueButton({ instrument, compact }) {
  const { profile, isApproved } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [busy, setBusy] = useState(false);
  if (!isApproved) return null;

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await reportIssue({ instrument, profile, description: text, severity });
      toast.success('Issue reported. Admins will see it in the admin panel.');
      setOpen(false);
      setText('');
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
            ? 'rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950'
            : 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-amber-700 ring-1 ring-inset ring-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:ring-amber-800 dark:hover:bg-amber-950'
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
          <Field label="Severity">
            <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="minor">Minor – still usable</option>
              <option value="major">Major – results may be affected</option>
              <option value="critical">Critical – do not use</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}

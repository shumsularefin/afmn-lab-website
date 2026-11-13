import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { deleteMaintenance, markServiced, saveMaintenance } from '../lib/data';
import { downloadCSV } from '../lib/csv';
import { fmtDate, toDate, toDateInput } from '../lib/time';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, PageHeader, Select, Textarea } from '../components/ui';

export function maintenanceState(m, now = new Date()) {
  const due = toDate(m.nextDue);
  if (!due) return { label: 'No schedule', cls: 'text-slate-500', chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', rank: 3 };
  const days = (due - now) / 864e5;
  if (days < 0) return { label: `Overdue ${Math.ceil(-days)} d`, cls: 'font-semibold text-rose-600', chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200', rank: 0 };
  if (days < 14) return { label: `Due in ${Math.ceil(days)} d`, cls: 'font-semibold text-amber-600', chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', rank: 1 };
  return { label: `In ${Math.ceil(days)} d`, cls: 'text-emerald-600', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', rank: 2 };
}

const EMPTY = { instrumentId: '', kind: 'maintenance', title: '', intervalDays: 90, lastServiced: toDateInput(new Date()), notes: '' };

export default function Maintenance() {
  const { isAdmin, profile } = useAuth();
  const { maintenance, instruments, instrumentsById } = useData();
  const toast = useToast();
  const [edit, setEdit] = useState(null); // {id?, ...form}
  const [busy, setBusy] = useState(false);

  const rows = [...maintenance].sort((a, b) => maintenanceState(a).rank - maintenanceState(b).rank || (toDate(a.nextDue) || 0) - (toDate(b.nextDue) || 0));

  async function save() {
    const inst = instrumentsById[edit.instrumentId];
    if (!inst || !edit.title.trim()) return toast.error('Pick an instrument and enter a title.');
    setBusy(true);
    try {
      await saveMaintenance(edit.id, { ...edit, instrumentName: inst.name, lastServiced: edit.lastServiced ? new Date(edit.lastServiced + 'T12:00') : null });
      toast.success('Saved');
      setEdit(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance & calibration"
        subtitle="Service schedule with last-serviced dates. Overdue items are listed first."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!rows.length}
              onClick={() =>
                downloadCSV('labboard-maintenance.csv', rows, [
                  { label: 'Instrument', key: 'instrumentName' },
                  { label: 'Type', key: 'kind' },
                  { label: 'Task', key: 'title' },
                  { label: 'Interval (days)', key: 'intervalDays' },
                  { label: 'Last serviced', get: (m) => toDateInput(m.lastServiced) },
                  { label: 'Next due', get: (m) => toDateInput(m.nextDue) },
                  { label: 'Notes', key: 'notes' },
                ])
              }
            >
              <Icon name="download" className="h-4 w-4" /> CSV
            </Button>
            {isAdmin && <Button onClick={() => setEdit({ ...EMPTY, instrumentId: instruments[0]?.id || '' })}>+ Add item</Button>}
          </>
        }
      />
      {!rows.length ? (
        <EmptyState icon="wrench" title="No maintenance items">{isAdmin ? 'Add the first one.' : 'Admins add service schedules here.'}</EmptyState>
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((m) => {
            const st = maintenanceState(m);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {m.title} <Badge className="ml-1 bg-slate-100 capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m.kind}</Badge>
                  </div>
                  <div className="text-sm text-slate-500">
                    {m.instrumentName} · every {m.intervalDays || '–'} d · last serviced {fmtDate(m.lastServiced)} · next due {fmtDate(m.nextDue)}
                  </div>
                  {m.notes && <div className="text-xs text-slate-500">{m.notes}</div>}
                  {m.log?.length > 0 && <div className="text-xs text-slate-400">Last logged by {m.log[m.log.length - 1].by}</div>}
                </div>
                <Badge className={st.chip}>{st.label}</Badge>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="success" onClick={() => window.confirm(`Mark “${m.title}” as serviced today?`) && markServiced(m, profile).then(() => toast.success('Logged'), toast.error)}>
                      ✓ Serviced today
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ ...m, lastServiced: toDateInput(m.lastServiced) })}><Icon name="edit" className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => window.confirm('Delete this item?') && deleteMaintenance(m.id)}><Icon name="trash" className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? 'Edit maintenance item' : 'New maintenance item'}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}
      >
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Instrument" className="sm:col-span-2">
              <Select value={edit.instrumentId} onChange={(e) => setEdit({ ...edit, instrumentId: e.target.value })}>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
            <Field label="Task" className="sm:col-span-2"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Replace lamp" /></Field>
            <Field label="Type">
              <Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                <option value="maintenance">Maintenance</option>
                <option value="calibration">Calibration</option>
              </Select>
            </Field>
            <Field label="Interval (days)"><Input type="number" min="0" value={edit.intervalDays} onChange={(e) => setEdit({ ...edit, intervalDays: e.target.value })} /></Field>
            <Field label="Last serviced" className="sm:col-span-2"><Input type="date" value={edit.lastServiced || ''} onChange={(e) => setEdit({ ...edit, lastServiced: e.target.value })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

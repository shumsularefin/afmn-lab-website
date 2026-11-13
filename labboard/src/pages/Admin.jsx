import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { useLiveQuery } from '../hooks/useQuery';
import { useSessionActions } from '../hooks/useSessionActions';
import {
  addToAllowlist, createInstrument, deleteInstrument, deleteUser, removeFromAllowlist,
  reopenIssue, resolveIssue, setOutOfService, updateInstrument, updateUser,
} from '../lib/data';
import { seedSampleData } from '../lib/seed';
import { downloadCSV } from '../lib/csv';
import { DEFAULT_MAX_BOOKING_HOURS } from '../lib/status';
import { fmtDateTime, fmtDuration, toDate } from '../lib/time';
import { Avatar, Badge, Button, Card, EmptyState, Field, Icon, Input, Modal, PageHeader, Select, Tabs, Textarea, cx } from '../components/ui';

export default function Admin() {
  const { openIssues } = useData();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('edit') ? 'instruments' : 'instruments');
  const users = useLiveQuery(() => collection(db, 'users'), []);
  const pending = users.data.filter((u) => !u.approved).length;

  return (
    <div>
      <PageHeader title="Admin" subtitle="Instruments, people, training approvals, issues and data." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'instruments', label: 'Instruments' },
          { value: 'users', label: 'Users & training', count: pending },
          { value: 'allow', label: 'Approved list' },
          { value: 'issues', label: 'Issues', count: openIssues.length },
          { value: 'sessions', label: 'Active sessions' },
          { value: 'data', label: 'Data' },
        ]}
      />
      {tab === 'instruments' && <InstrumentsTab editId={params.get('edit')} clearEdit={() => setParams({})} />}
      {tab === 'users' && <UsersTab users={users.data} />}
      {tab === 'allow' && <AllowlistTab />}
      {tab === 'issues' && <IssuesTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'data' && <DataTab users={users.data} />}
    </div>
  );
}

// ── Instruments ──────────────────────────────────────────────────────────────

const BLANK = {
  name: '', type: '', room: '', location: '', photoURL: '', manualURL: '', safetyNotes: '',
  requiredTraining: '', restricted: false, maxBookingHours: DEFAULT_MAX_BOOKING_HOURS, description: '', order: 0,
};

function InstrumentsTab({ editId, clearEdit }) {
  const { instruments, instrumentsById, sessionsByInstrument } = useData();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [oos, setOos] = useState(null); // { inst, reason }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editId && instrumentsById[editId]) setForm({ ...BLANK, ...instrumentsById[editId] });
  }, [editId, instrumentsById]);

  const close = () => {
    setForm(null);
    clearEdit();
  };

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required.');
    setBusy(true);
    try {
      if (form.id) await updateInstrument(form.id, form);
      else await createInstrument(form);
      toast.success('Saved');
      close();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setForm({ ...BLANK, order: instruments.length + 1 })}>+ Add instrument</Button>
      </div>
      {!instruments.length ? (
        <EmptyState title="No instruments">Add one, or load sample data from the Data tab.</EmptyState>
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {instruments.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
              {i.photoURL ? <img src={i.photoURL} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <div className="h-12 w-16 rounded-lg bg-slate-100 dark:bg-slate-800" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-white">
                  {i.name} {i.restricted && <span title="Training required">🎓</span>}
                </div>
                <div className="text-xs text-slate-500">{[i.type, i.room, `max ${i.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS} h`].filter(Boolean).join(' · ')}</div>
                {i.status === 'out_of_service' && <div className="text-xs font-semibold text-rose-600">Out of service: {i.outOfServiceReason}</div>}
                {sessionsByInstrument[i.id] && <div className="text-xs text-sky-600">In use by {sessionsByInstrument[i.id].userName}</div>}
              </div>
              <div className="flex flex-wrap gap-1">
                {i.status === 'out_of_service' ? (
                  <Button size="sm" variant="success" onClick={() => setOutOfService(i.id, '').then(() => toast.success('Back in service'), toast.error)}>Back in service</Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setOos({ inst: i, reason: '' })}>Out of service</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setForm({ ...BLANK, ...i })}><Icon name="edit" className="h-4 w-4" /> Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.confirm(`Delete ${i.name}? History stays, but the instrument disappears from the board.`) && deleteInstrument(i.id).catch(toast.error)}
                >
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal
        wide
        open={Boolean(form)}
        onClose={close}
        title={form?.id ? `Edit ${form.name}` : 'New instrument'}
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" className="sm:col-span-2"><Input value={form.name} onChange={set('name')} autoFocus /></Field>
            <Field label="Type" hint="Used for filtering, e.g. Microscopy"><Input value={form.type} onChange={set('type')} list="types" /></Field>
            <Field label="Room"><Input value={form.room} onChange={set('room')} list="rooms" /></Field>
            <Field label="Exact location" className="sm:col-span-2"><Input value={form.location} onChange={set('location')} /></Field>
            <Field label="Photo URL" hint="Paste an image link (Cloud Storage needs the Blaze plan for new projects)."><Input value={form.photoURL} onChange={set('photoURL')} /></Field>
            <Field label="Manual URL"><Input value={form.manualURL} onChange={set('manualURL')} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={set('description')} rows={2} /></Field>
            <Field label="Safety notes" className="sm:col-span-2"><Textarea value={form.safetyNotes} onChange={set('safetyNotes')} rows={2} /></Field>
            <Field label="Required training"><Input value={form.requiredTraining} onChange={set('requiredTraining')} /></Field>
            <Field label="Max booking length (hours)"><Input type="number" min="1" max="168" value={form.maxBookingHours} onChange={set('maxBookingHours')} /></Field>
            <Field label="Sort order"><Input type="number" value={form.order} onChange={set('order')} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.restricted} onChange={set('restricted')} className="h-4 w-4 rounded" />
              Restricted – only training-approved users may use or book
            </label>
            <datalist id="types">{[...new Set(instruments.map((i) => i.type).filter(Boolean))].map((t) => <option key={t} value={t} />)}</datalist>
            <datalist id="rooms">{[...new Set(instruments.map((i) => i.room).filter(Boolean))].map((t) => <option key={t} value={t} />)}</datalist>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(oos)}
        onClose={() => setOos(null)}
        title={`Mark ${oos?.inst.name} out of service`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOos(null)}>Cancel</Button>
            <Button variant="danger" disabled={!oos?.reason.trim()} onClick={() => setOutOfService(oos.inst.id, oos.reason.trim()).then(() => setOos(null), toast.error)}>
              Mark out of service
            </Button>
          </>
        }
      >
        {oos && (
          <Field label="Reason (shown on the board)">
            <Textarea autoFocus value={oos.reason} onChange={(e) => setOos({ ...oos, reason: e.target.value })} placeholder="e.g. Lamp replacement, back Friday" />
          </Field>
        )}
      </Modal>
    </>
  );
}

// ── Users & training ─────────────────────────────────────────────────────────

function UsersTab({ users }) {
  const { profile } = useAuth();
  const { instruments } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [training, setTraining] = useState(null);
  const restricted = instruments.filter((i) => i.restricted);
  const list = users
    .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.approved) - Number(b.approved) || (a.name || '').localeCompare(b.name || ''));

  const upd = (u, patch) => updateUser(u.id, patch).then(() => toast.success('Updated'), toast.error);

  return (
    <>
      <Input type="search" placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 max-w-sm" />
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((u) => (
          <div key={u.id} className={cx('flex flex-wrap items-center gap-3 p-3', !u.approved && 'bg-amber-50/60 dark:bg-amber-950/30')}>
            <Avatar src={u.photoURL} name={u.name} size="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                {u.name} {!u.approved && <Badge className="bg-amber-200 text-amber-900">Pending</Badge>}
              </div>
              <div className="truncate text-xs text-slate-500">{u.email} · last seen {fmtDateTime(u.lastLoginAt)}</div>
              {restricted.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {restricted.filter((i) => (u.trainedOn || []).includes(i.id)).map((i) => (
                    <Badge key={i.id} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">🎓 {i.name}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Select value={u.role} onChange={(e) => upd(u, { role: e.target.value })} disabled={u.id === profile.uid} className="w-auto py-1.5" aria-label="Role">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="guest">Guest (view only)</option>
              </Select>
              {u.approved ? (
                <Button size="sm" variant="ghost" disabled={u.id === profile.uid} onClick={() => window.confirm(`Revoke access for ${u.name}?`) && upd(u, { approved: false })}>Revoke</Button>
              ) : (
                <Button size="sm" variant="success" onClick={() => upd(u, { approved: true, role: u.role === 'guest' ? 'member' : u.role })}>Approve</Button>
              )}
              {restricted.length > 0 && <Button size="sm" variant="secondary" onClick={() => setTraining(u)}>Training</Button>}
              {u.id !== profile.uid && (
                <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${u.name}'s profile? They'll be pending again on next sign-in.`) && deleteUser(u.id).catch(toast.error)}>
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>

      <Modal open={Boolean(training)} onClose={() => setTraining(null)} title={`Training approvals – ${training?.name}`} footer={<Button onClick={() => setTraining(null)}>Done</Button>}>
        {training && (
          <div className="space-y-2">
            {restricted.map((i) => {
              const live = users.find((u) => u.id === training.id) || training;
              const on = (live.trainedOn || []).includes(i.id);
              return (
                <label key={i.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded"
                    checked={on}
                    onChange={() => {
                      const next = on ? (live.trainedOn || []).filter((x) => x !== i.id) : [...(live.trainedOn || []), i.id];
                      updateUser(live.id, { trainedOn: next }).catch(toast.error);
                    }}
                  />
                  <span>
                    <span className="block font-medium text-slate-900 dark:text-white">{i.name}</span>
                    <span className="block text-xs text-slate-500">{i.requiredTraining}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Allowlist ────────────────────────────────────────────────────────────────

function AllowlistTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const list = useLiveQuery(() => collection(db, 'allowlist'), []);
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState('member');

  async function add() {
    const items = emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e));
    if (!items.length) return toast.error('Enter at least one valid email.');
    try {
      await Promise.all(items.map((e) => addToAllowlist(e, role, profile.email)));
      toast.success(`Added ${items.length}`);
      setEmails('');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,1.4fr]">
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">Pre-approve people</h2>
        <p className="text-sm text-slate-500">People on this list get in automatically with the chosen role the first time they sign in with Google. Paste many emails at once.</p>
        <Textarea rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="alice@gmail.com, bob@university.edu" />
        <div className="flex gap-2">
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="guest">Guest (view only)</option>
          </Select>
          <Button onClick={add}>Add</Button>
        </div>
      </Card>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {!list.data.length && <p className="p-4 text-sm text-slate-500">Empty.</p>}
        {list.data.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
            <span className="truncate">{a.id}</span>
            <span className="flex items-center gap-2">
              <Badge className="bg-slate-100 capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">{a.role}</Badge>
              <button className="text-slate-400 hover:text-rose-600" onClick={() => removeFromAllowlist(a.id).catch(toast.error)} aria-label="Remove"><Icon name="trash" className="h-4 w-4" /></button>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Issues ───────────────────────────────────────────────────────────────────

function IssuesTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const all = useLiveQuery(() => query(collection(db, 'issues'), orderBy('createdAt', 'desc'), limit(200)), []);
  const [show, setShow] = useState('open');
  const rows = all.data.filter((i) => show === 'all' || i.status === show);
  const sev = { critical: 'bg-rose-600 text-white', major: 'bg-orange-100 text-orange-800', minor: 'bg-slate-100 text-slate-700' };

  return (
    <>
      <div className="mb-3 flex gap-2">
        {['open', 'resolved', 'all'].map((s) => (
          <Button key={s} size="sm" variant={show === s ? 'primary' : 'secondary'} onClick={() => setShow(s)} className="capitalize">{s}</Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() =>
            downloadCSV('labboard-issues.csv', all.data, [
              { label: 'Instrument', key: 'instrumentName' },
              { label: 'Severity', key: 'severity' },
              { label: 'Status', key: 'status' },
              { label: 'Description', key: 'description' },
              { label: 'Reported by', key: 'reportedByName' },
              { label: 'Reported', get: (i) => toDate(i.createdAt)?.toISOString() },
              { label: 'Resolved by', key: 'resolvedBy' },
              { label: 'Resolution', key: 'resolution' },
            ])
          }
        >
          <Icon name="download" className="h-4 w-4" /> CSV
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState icon="check" title="No issues here" />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((i) => (
            <div key={i.id} className="flex flex-wrap items-start gap-3 p-4">
              <Badge className={cx('capitalize', sev[i.severity] || sev.minor)}>{i.severity}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 dark:text-white">{i.instrumentName}</div>
                <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{i.description}</p>
                <div className="text-xs text-slate-500">
                  {i.reportedByName} · {fmtDateTime(i.createdAt)}
                  {i.status === 'resolved' && <> · resolved by {i.resolvedBy} {i.resolution && `– ${i.resolution}`}</>}
                </div>
              </div>
              {i.status === 'open' ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="success" onClick={() => resolveIssue(i, profile, window.prompt('Resolution note (optional)') || '').catch(toast.error)}>Resolve</Button>
                  {i.severity === 'critical' && (
                    <Button size="sm" variant="danger" onClick={() => setOutOfService(i.instrumentId, i.description.slice(0, 200)).then(() => toast.success('Marked out of service'), toast.error)}>
                      Out of service
                    </Button>
                  )}
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => reopenIssue(i).catch(toast.error)}>Reopen</Button>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

// ── Active sessions (force-finish stale ones) ────────────────────────────────

function SessionsTab() {
  const { activeSessions } = useData();
  const { finish } = useSessionActions();
  const now = new Date();
  if (!activeSessions.length) return <EmptyState icon="check" title="No active sessions" />;
  return (
    <Card className="divide-y divide-slate-100 dark:divide-slate-800">
      {[...activeSessions].sort((a, b) => toDate(a.expectedEnd) - toDate(b.expectedEnd)).map((s) => {
        const over = toDate(s.expectedEnd) < now;
        return (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
            <Avatar src={s.userPhoto} name={s.userName} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900 dark:text-white">{s.instrumentName} · {s.userName}</div>
              <div className={cx('text-xs', over ? 'font-semibold text-orange-600' : 'text-slate-500')}>
                Started {fmtDateTime(s.startedAt)} · expected end {fmtDateTime(s.expectedEnd)} {over && `(overdue ${fmtDuration(now - toDate(s.expectedEnd))})`}
              </div>
            </div>
            <Button size="sm" variant={over ? 'warning' : 'secondary'} onClick={() => window.confirm(`Force-finish ${s.userName}'s session on ${s.instrumentName}?`) && finish(s)}>
              Force finish
            </Button>
          </div>
        );
      })}
    </Card>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

function DataTab({ users }) {
  const { profile } = useAuth();
  const { instruments, bookings, maintenance } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">Sample data</h2>
        <p className="text-sm text-slate-500">Adds 6 sample instruments (one out of service), maintenance items and parameter templates. Safe to run twice – existing names are skipped.</p>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const n = await seedSampleData(profile);
              toast.success(`Sample data loaded (${n} instruments)`);
            } catch (e) {
              toast.error(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Load sample data
        </Button>
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-slate-900 dark:text-white">CSV export</h2>
        <p className="text-sm text-slate-500">Session history CSV is on the History and Statistics pages.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCSV('labboard-instruments.csv', instruments, ['name', 'type', 'room', 'location', 'status', 'outOfServiceReason', 'restricted', 'maxBookingHours', 'requiredTraining', 'manualURL'].map((k) => ({ key: k, label: k })))}>
            Instruments
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV('labboard-users.csv', users, [
                { label: 'Name', key: 'name' },
                { label: 'Email', key: 'email' },
                { label: 'Role', key: 'role' },
                { label: 'Approved', key: 'approved' },
                { label: 'Trained on', get: (u) => (u.trainedOn || []).map((id) => instruments.find((i) => i.id === id)?.name || id).join('; ') },
              ])
            }
          >
            Users
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadCSV('labboard-bookings.csv', bookings, [
                { label: 'Instrument', key: 'instrumentName' },
                { label: 'User', key: 'userName' },
                { label: 'Start', get: (b) => toDate(b.start)?.toISOString() },
                { label: 'End', get: (b) => toDate(b.end)?.toISOString() },
                { label: 'Status', key: 'status' },
                { label: 'Purpose', key: 'purpose' },
              ])
            }
          >
            Bookings (current)
          </Button>
          <Button variant="secondary" onClick={() => downloadCSV('labboard-maintenance.csv', maintenance, ['instrumentName', 'kind', 'title', 'intervalDays'].map((k) => ({ key: k, label: k })))}>
            Maintenance
          </Button>
        </div>
      </Card>
    </div>
  );
}

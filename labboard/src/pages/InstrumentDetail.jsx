import { Link, useParams } from 'react-router-dom';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useLiveQuery } from '../hooks/useQuery';
import { useNow } from '../hooks/useNow';
import { useSessionActions } from '../hooks/useSessionActions';
import { deriveInstrument, bookingIsLive, DEFAULT_MAX_BOOKING_HOURS } from '../lib/status';
import { fmtDate, fmtDateTime, fmtTime, toDate } from '../lib/time';
import { Badge, Card, EmptyState, Icon } from '../components/ui';
import { InstrumentCard } from '../components/InstrumentCard';
import { IssueButton } from '../components/IssueButton';
import { maintenanceState } from './Maintenance';

export default function InstrumentDetail() {
  const { id } = useParams();
  const { profile, isAdmin } = useAuth();
  const { instrumentsById, sessionsByInstrument, bookings, maintenance, openIssues } = useData();
  const { finish, extend } = useSessionActions();
  const now = useNow(1000);
  const inst = instrumentsById[id];
  const recent = useLiveQuery(
    () => query(collection(db, 'sessions'), where('instrumentId', '==', id), orderBy('startedAt', 'desc'), limit(10)),
    [id],
  );

  if (!inst) return <EmptyState title="Instrument not found"><Link to="/" className="text-indigo-600">Back to dashboard</Link></EmptyState>;

  const d = deriveInstrument(inst, sessionsByInstrument, bookings, now);
  const trained = !inst.restricted || (profile.trainedOn || []).includes(inst.id) || isAdmin;
  const upcoming = bookings.filter((b) => b.instrumentId === id && b.status === 'booked' && bookingIsLive(b, now)).sort((a, b) => toDate(a.start) - toDate(b.start));
  const maint = maintenance.filter((m) => m.instrumentId === id);
  const issues = openIssues.filter((i) => i.instrumentId === id);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[2fr,3fr]">
        <Card className="overflow-hidden">
          {inst.photoURL ? (
            <img src={inst.photoURL} alt={inst.name} className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-slate-100 text-slate-300 dark:bg-slate-800"><Icon name="wrench" className="h-16 w-16" /></div>
          )}
          <div className="space-y-3 p-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{inst.name}</h1>
              <p className="text-sm text-slate-500">{[inst.type, inst.room].filter(Boolean).join(' · ')}</p>
            </div>
            {inst.description && <p className="text-sm text-slate-700 dark:text-slate-300">{inst.description}</p>}
            <dl className="space-y-2 text-sm">
              {inst.location && <Row icon="map" label="Location">{inst.location}</Row>}
              {inst.manualURL && (
                <Row icon="book" label="Manual">
                  <a href={inst.manualURL} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Open manual ↗</a>
                </Row>
              )}
              <Row icon="clock" label="Max booking">{inst.maxBookingHours || DEFAULT_MAX_BOOKING_HOURS} h</Row>
              <Row icon="shield" label="Training">
                {inst.requiredTraining || 'None'}
                {inst.restricted && (
                  <Badge className={trained ? 'ml-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}>
                    {trained ? '✓ You are approved' : 'Approval needed'}
                  </Badge>
                )}
              </Row>
            </dl>
            {inst.safetyNotes && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <div className="mb-1 font-bold">⚠ Safety notes</div>
                <p className="whitespace-pre-line">{inst.safetyNotes}</p>
              </div>
            )}
            <div className="flex gap-2">
              <IssueButton instrument={inst} />
              {isAdmin && <Link to={`/admin?edit=${inst.id}`} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700"><Icon name="edit" className="h-4 w-4" /> Edit</Link>}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <InstrumentCard inst={inst} d={d} now={now} myUid={profile.uid} openIssueCount={issues.length} onFinish={finish} onExtend={(s) => extend(s, 3600e3)} />

          {issues.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Open issues</h2>
              <ul className="space-y-2 text-sm">
                {issues.map((i) => (
                  <li key={i.id} className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/50">
                    <b className="capitalize">{i.severity}</b>: {i.description}
                    <div className="text-xs text-slate-500">{i.reportedByName} · {fmtDateTime(i.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-white">Upcoming bookings</h2>
              <Link to={`/bookings?instrument=${id}`} className="text-sm font-medium text-indigo-600">Book →</Link>
            </div>
            {!upcoming.length ? <p className="text-sm text-slate-500">None.</p> : (
              <ul className="space-y-1 text-sm">
                {upcoming.slice(0, 8).map((b) => <li key={b.id}><b>{b.userName}</b> · {fmtDateTime(b.start)} – {fmtTime(b.end)}</li>)}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Maintenance & calibration</h2>
            {!maint.length ? <p className="text-sm text-slate-500">No schedule recorded.</p> : (
              <ul className="space-y-1 text-sm">
                {maint.map((m) => {
                  const st = maintenanceState(m);
                  return (
                    <li key={m.id} className="flex justify-between gap-2">
                      <span>{m.title} <span className="text-xs text-slate-400">({m.kind})</span></span>
                      <span className={st.cls}>last {fmtDate(m.lastServiced)} · due {fmtDate(m.nextDue)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Recent sessions</h2>
            {!recent.data.length ? <p className="text-sm text-slate-500">{recent.error ? 'Deploy firestore.indexes.json to enable this list.' : 'None yet.'}</p> : (
              <ul className="space-y-1 text-sm">
                {recent.data.map((s) => <li key={s.id}>{fmtDateTime(s.startedAt)} · <b>{s.userName}</b> {s.sample && `· ${s.sample}`}</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <div className="flex gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

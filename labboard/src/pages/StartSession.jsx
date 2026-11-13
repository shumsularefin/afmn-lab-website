import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { useLiveQuery } from '../hooks/useQuery';
import { canUseInstrument, deleteTemplate, saveTemplate, startSession } from '../lib/data';
import { deriveInstrument, bookingIsLive } from '../lib/status';
import { fmtTime, toDate, HOUR } from '../lib/time';
import { Button, Card, Field, Icon, Input, PageHeader, Textarea, cx } from '../components/ui';
import { ParamEditor } from '../components/ParamEditor';
import { EndTimePicker } from '../components/EndTimePicker';

const lastKey = (id) => `labboard-last-${id}`;

export default function StartSession() {
  const { profile, isAdmin } = useAuth();
  const { instruments, instrumentsById, sessionsByInstrument, bookings } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [instrumentId, setInstrumentId] = useState(params.get('instrument') || '');
  const [expectedEnd, setExpectedEnd] = useState(() => new Date(Date.now() + HOUR));
  const [sample, setSample] = useState('');
  const [rows, setRows] = useState([]);
  const [comments, setComments] = useState('');
  const [tplName, setTplName] = useState('');
  const [saveTpl, setSaveTpl] = useState(false);
  const [busy, setBusy] = useState(false);

  const inst = instrumentsById[instrumentId];
  const templates = useLiveQuery(
    () => (instrumentId ? query(collection(db, 'templates'), where('instrumentId', '==', instrumentId)) : null),
    [instrumentId],
  );

  // Pre-fill with what this person used last time on this instrument.
  useEffect(() => {
    if (!instrumentId) return;
    try {
      const last = JSON.parse(localStorage.getItem(lastKey(instrumentId)) || 'null');
      if (last) {
        setRows(last.params || []);
        setSample(last.sample || '');
      } else {
        setRows([]);
      }
    } catch {
      /* ignore */
    }
  }, [instrumentId]);

  const now = new Date();
  const choices = useMemo(
    () =>
      instruments.map((i) => {
        const d = deriveInstrument(i, sessionsByInstrument, bookings, now);
        let reason = null;
        if (i.status === 'out_of_service') reason = 'Out of service';
        else if (d.session) reason = `In use by ${d.session.userName}`;
        else if (d.currentBooking && d.currentBooking.userId !== profile.uid) reason = `Reserved by ${d.currentBooking.userName}`;
        else if (!canUseInstrument(i, profile)) reason = 'Training approval needed';
        return { i, d, reason };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [instruments, sessionsByInstrument, bookings, profile],
  );

  const nextOther = inst
    ? bookings
        .filter((b) => b.instrumentId === inst.id && b.userId !== profile.uid && b.status === 'booked' && bookingIsLive(b) && toDate(b.start) > now)
        .sort((a, b) => toDate(a.start) - toDate(b.start))[0]
    : null;
  const clashesNext = nextOther && expectedEnd && expectedEnd > toDate(nextOther.start);

  function applyTemplate(t) {
    setRows(t.params || []);
    if (t.sample) setSample(t.sample);
    if (t.comments) setComments(t.comments);
    toast.info(`Template “${t.name}” applied`);
  }

  async function submit(e) {
    e.preventDefault();
    if (!inst) return toast.error('Pick an instrument first.');
    if (!expectedEnd || expectedEnd <= new Date()) return toast.error('Pick an expected end time in the future.');
    if (clashesNext && !window.confirm(`${nextOther.userName} has booked from ${fmtTime(nextOther.start)}. Start anyway?`)) return;
    setBusy(true);
    try {
      await startSession({ instrument: inst, profile, sample, params: rows, comments, expectedEnd, bookings });
      try {
        localStorage.setItem(lastKey(inst.id), JSON.stringify({ params: rows, sample }));
      } catch {
        /* ignore */
      }
      if (saveTpl && tplName.trim()) await saveTemplate({ instrumentId: inst.id, name: tplName, params: rows, profile });
      toast.success(`Session started on ${inst.name}`);
      nav('/my');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Start a session" subtitle="Takes about 20 seconds. Everything except the instrument and end time is optional." />

      <Card className="p-5">
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">1 · Instrument</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map(({ i, reason }) => (
            <button
              type="button"
              key={i.id}
              disabled={Boolean(reason)}
              onClick={() => setInstrumentId(i.id)}
              className={cx(
                'flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition',
                instrumentId === i.id ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700',
                reason && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', reason ? 'bg-slate-400' : 'bg-emerald-500')} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{i.name}</span>
                <span className={cx('block truncate text-xs', instrumentId === i.id ? 'text-indigo-100' : 'text-slate-500')}>{reason || [i.type, i.room].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      {inst && (
        <>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">2 · Expected end</h2>
            <EndTimePicker value={expectedEnd} onChange={setExpectedEnd} />
            {nextOther && (
              <p className={cx('mt-3 text-sm', clashesNext ? 'font-semibold text-orange-600' : 'text-slate-500')}>
                {clashesNext ? '⚠ ' : ''}Next booking: {nextOther.userName} at {fmtTime(nextOther.start)}
              </p>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold text-slate-900 dark:text-white">3 · Details</h2>
            <Field label="Sample / experiment">
              <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. HeLa GFP-actin, plate 3" maxLength={200} />
            </Field>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
                  <Icon name="lock" className="h-4 w-4" /> Locked parameters – others must not change these
                </span>
              </div>
              {templates.data.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="self-center text-xs text-slate-500">Templates:</span>
                  {templates.data.map((t) => (
                    <span key={t.id} className="inline-flex items-center rounded-full bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950 dark:ring-indigo-800">
                      <button type="button" onClick={() => applyTemplate(t)} className="px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                        {t.name}
                      </button>
                      {(t.createdBy === profile.uid || isAdmin) && (
                        <button
                          type="button"
                          title="Delete template"
                          onClick={() => window.confirm(`Delete template “${t.name}”?`) && deleteTemplate(t.id)}
                          className="pr-2 text-indigo-300 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <ParamEditor value={rows} onChange={setRows} />
              <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={saveTpl} onChange={(e) => setSaveTpl(e.target.checked)} className="h-4 w-4 rounded" />
                Save these parameters as a template
                {saveTpl && <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" className="max-w-xs" />}
              </label>
            </div>

            <Field label="Comments for others">
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Don't open the incubator door. Call me at 555-1234 if anything beeps." maxLength={2000} />
            </Field>
          </Card>

          <div className="sticky bottom-20 z-10 lg:bottom-4">
            <Button type="submit" size="xl" className="w-full" loading={busy}>
              <Icon name="play" /> Start session on {inst.name}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

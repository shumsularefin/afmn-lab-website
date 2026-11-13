import { addDoc, collection, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { SAMPLE_INSTRUMENTS, SAMPLE_MAINTENANCE, SAMPLE_TEMPLATES } from './seedData';

/** Admin-only: writes sample instruments, maintenance and templates. */
export async function seedSampleData(profile) {
  const existing = await getDocs(collection(db, 'instruments'));
  const byName = new Map(existing.docs.map((d) => [d.data().name, d.id]));
  const ids = {};
  for (const { key, ...inst } of SAMPLE_INSTRUMENTS) {
    if (byName.has(inst.name)) {
      ids[key] = byName.get(inst.name);
      continue;
    }
    const ref = await addDoc(collection(db, 'instruments'), {
      ...inst,
      status: key === 'spectro' ? 'out_of_service' : 'ok',
      outOfServiceReason: key === 'spectro' ? 'Lamp burned out – replacement ordered (ETA Friday)' : '',
      activeSession: null,
      freeSince: Timestamp.fromDate(new Date(Date.now() - Math.random() * 6 * 3600e3)),
      createdAt: serverTimestamp(),
    });
    ids[key] = ref.id;
  }
  const name = (key) => SAMPLE_INSTRUMENTS.find((i) => i.key === key).name;
  for (const m of SAMPLE_MAINTENANCE) {
    const last = new Date(Date.now() - m.daysAgo * 86400e3);
    await addDoc(collection(db, 'maintenance'), {
      instrumentId: ids[m.key],
      instrumentName: name(m.key),
      kind: m.kind,
      title: m.title,
      intervalDays: m.intervalDays,
      lastServiced: Timestamp.fromDate(last),
      nextDue: Timestamp.fromDate(new Date(last.getTime() + m.intervalDays * 86400e3)),
      notes: '',
      log: [],
      updatedAt: serverTimestamp(),
    });
  }
  for (const t of SAMPLE_TEMPLATES) {
    await addDoc(collection(db, 'templates'), {
      instrumentId: ids[t.key],
      name: t.name,
      params: t.params,
      sample: '',
      comments: '',
      createdBy: profile.uid,
      createdByName: profile.name,
      createdAt: serverTimestamp(),
    });
  }
  return Object.keys(ids).length;
}

import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * One-time (not live) fetch of sessions that started in [from, to).
 * History/stats don't need real-time updates, and one-shot reads are cheaper.
 */
export function useSessionsRange(from, to, max = 2000) {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  const fromMs = from?.getTime();
  const toMs = to?.getTime();

  const load = useCallback(async () => {
    if (!fromMs || !toMs) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const snap = await getDocs(
        query(collection(db, 'sessions'), where('startedAt', '>=', new Date(fromMs)), where('startedAt', '<', new Date(toMs)), orderBy('startedAt', 'desc'), limit(max)),
      );
      setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null });
    } catch (error) {
      console.error(error);
      setState({ data: [], loading: false, error });
    }
  }, [fromMs, toMs, max]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

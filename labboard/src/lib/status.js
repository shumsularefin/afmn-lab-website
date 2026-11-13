import { toDate, startOfDay, endOfDay, HOUR, MIN } from './time';

export const AUTO_RELEASE_MIN = 30;
export const DEFAULT_MAX_BOOKING_HOURS = 12;

export const STATUS = {
  free: { label: 'Free now', dot: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
  busy: { label: 'In use', dot: 'bg-sky-500', ring: 'ring-sky-500/30', text: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' },
  overdue: { label: 'Overdue', dot: 'bg-orange-500', ring: 'ring-orange-500/60', text: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' },
  booked: { label: 'Booked later today', dot: 'bg-violet-500', ring: 'ring-violet-500/30', text: 'text-violet-700 dark:text-violet-300', chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' },
  oos: { label: 'Out of service', dot: 'bg-rose-500', ring: 'ring-rose-500/30', text: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200' },
};

/** A booking still "counts" if booked/started and not a no-show past the grace period. */
export function bookingIsLive(b, now = new Date()) {
  if (!b) return false;
  if (b.status === 'cancelled' || b.status === 'released') return false;
  if (b.status === 'booked' && now.getTime() > toDate(b.start).getTime() + AUTO_RELEASE_MIN * MIN) return false;
  return toDate(b.end) > now || b.status === 'started';
}

export function bookingIsNoShow(b, now = new Date()) {
  return b.status === 'booked' && now.getTime() > toDate(b.start).getTime() + AUTO_RELEASE_MIN * MIN;
}

/**
 * Derive everything a card needs from the raw collections.
 * Returns { kind, session, nextBooking, currentBooking, freeForMs, overdue }
 */
export function deriveInstrument(inst, sessionsByInstrument, bookings, now = new Date()) {
  const session = sessionsByInstrument[inst.id] || null;
  const upcoming = bookings
    .filter((b) => b.instrumentId === inst.id && b.status === 'booked' && bookingIsLive(b, now))
    .sort((a, b) => toDate(a.start) - toDate(b.start));
  const currentBooking = upcoming.find((b) => toDate(b.start) <= now && toDate(b.end) > now) || null;
  const nextBooking = upcoming.find((b) => toDate(b.start) > now) || null;

  let kind;
  let overdue = false;
  if (inst.status === 'out_of_service') kind = 'oos';
  else if (session) {
    overdue = toDate(session.expectedEnd) < now;
    kind = overdue ? 'overdue' : 'busy';
  } else if (currentBooking || (nextBooking && toDate(nextBooking.start) < endOfDay(now))) kind = 'booked';
  else kind = 'free';

  const freeSince = toDate(inst.freeSince) || toDate(inst.createdAt);
  const freeForMs = !session && freeSince ? now - freeSince : null;
  // How long it stays free from now (until the next booking or end of horizon)
  const freeUntil = currentBooking ? now : nextBooking ? toDate(nextBooking.start) : null;
  const freeAheadMs = session || inst.status === 'out_of_service' ? 0 : freeUntil ? freeUntil - now : Infinity;

  return { kind, session, currentBooking, nextBooking, freeForMs, freeAheadMs, overdue };
}

/** Summary strip groups; overdue counts as "in use". */
export function summaryGroup(kind) {
  return kind === 'overdue' ? 'busy' : kind;
}

export function todayRange(now = new Date()) {
  return [startOfDay(now), endOfDay(now)];
}

export const FREE_2H_MS = 2 * HOUR;

import { forwardRef, useEffect, useState } from 'react';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

// macOS push buttons: compact, softly lit, with a 3 px focus halo. Larger tap targets on phones.
const BTN = {
  primary:
    'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.35),0_1px_2px_rgba(0,90,200,.35)] hover:from-indigo-400 hover:to-indigo-500 active:from-indigo-600 active:to-indigo-700',
  secondary:
    'bg-white text-slate-900 shadow-control hover:bg-slate-50 active:bg-slate-100 dark:bg-white/[0.12] dark:text-white dark:shadow-[inset_0_0.5px_0_rgba(255,255,255,.12)] dark:hover:bg-white/[0.16]',
  danger: 'bg-gradient-to-b from-rose-400 to-rose-500 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.3),0_1px_2px_rgba(200,30,20,.35)] hover:from-rose-400 hover:to-rose-400',
  success: 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.3),0_1px_2px_rgba(30,140,60,.35)] hover:to-emerald-400',
  warning: 'bg-gradient-to-b from-orange-400 to-orange-500 text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,.3),0_1px_2px_rgba(200,110,0,.35)] hover:to-orange-400',
  ghost: 'text-indigo-600 hover:bg-black/[0.05] active:bg-black/[0.08] dark:text-indigo-400 dark:hover:bg-white/[0.08]',
  plain: 'text-slate-700 hover:bg-black/[0.05] active:bg-black/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.08]',
};
const SIZE = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-[15px] rounded-xl',
  lg: 'h-12 px-5 text-[17px] rounded-xl',
  xl: 'h-14 px-6 text-lg rounded-2xl',
};

export function Button({ variant = 'primary', size = 'md', className, loading, children, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background,box-shadow,transform] duration-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-indigo-500/40 disabled:pointer-events-none disabled:opacity-45',
        BTN[variant],
        SIZE[size],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('rounded-2xl bg-white shadow-card ring-1 ring-black/[0.06] dark:bg-slate-900 dark:ring-white/[0.07] lg:rounded-xl', className)} {...props}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>}
      {children}
      {hint && <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

// Inputs are full width unless the caller passes its own width class.
const withWidth = (className = '') => (/(^|\s)(w-|max-w-|flex-1)/.test(className) ? className : `w-full ${className}`);
const INPUT =
  'block rounded-xl border-0 bg-white px-3 py-2.5 text-[16px] text-slate-900 shadow-control outline-none transition-shadow placeholder:text-slate-400 focus:shadow-[0_0_0_1px_theme(colors.indigo.500),0_0_0_4px_rgba(0,122,255,.25)] dark:bg-white/[0.07] dark:text-slate-100 dark:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,.14)] lg:text-[15px]';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(INPUT, withWidth(className))} {...props} />;
});
export function Textarea({ className, ...props }) {
  return <textarea className={cx(INPUT, 'leading-relaxed', withWidth(className))} rows={3} {...props} />;
}
export function Select({ className, children, ...props }) {
  return (
    <select
      className={cx(
        INPUT,
        'appearance-none bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat pr-8',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2386868b'%3E%3Cpath d='M10 3 6 7.5h8L10 3Zm0 14 4-4.5H6l4 4.5Z'/%3E%3C/svg%3E\")]",
        withWidth(className),
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** iOS-style switch. */
export function Toggle({ checked, onChange, label, className }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2.5', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 lg:h-[22px] lg:w-[38px]', checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20')}
      >
        <span className={cx('absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,.2)] transition-transform duration-200 lg:h-[18px] lg:w-[18px]', checked ? 'translate-x-[20px] lg:translate-x-[18px]' : 'translate-x-[2px]')} />
      </button>
      {label && <span className="text-[15px] lg:text-[15px]">{label}</span>}
    </label>
  );
}

export function Badge({ className, children }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

export function Avatar({ src, name, size = 'h-8 w-8', className }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || '?')
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return src && !broken ? (
    <img src={src} alt={name || ''} referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cx(size, 'shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/10', className)} />
  ) : (
    <span className={cx(size, 'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-slate-400 to-slate-500 text-xs font-semibold text-white', className)}>
      {initials}
    </span>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  // macOS-style activity indicator (12 fading spokes)
  return (
    <svg className={cx('animate-spin [animation-duration:0.9s] [animation-timing-function:steps(12)]', className)} viewBox="0 0 24 24" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x="11" y="2" width="2" height="6" rx="1" fill="currentColor" opacity={0.15 + (i / 12) * 0.85} transform={`rotate(${i * 30} 12 12)`} />
      ))}
    </svg>
  );
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Sheet: a centered macOS sheet on desktop, an iOS bottom sheet with a grabber on phones. */
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92vh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-[22px] bg-white shadow-sheet dark:bg-slate-900 dark:ring-1 dark:ring-white/10 sm:animate-zoom-in sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-2 pt-3 sm:pt-4">
          <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white sm:text-[15px]">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/15" aria-label="Close">
            <Icon name="x" className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/[0.06] bg-slate-50/80 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200 shadow-card dark:from-white/10 dark:to-white/5">
        <Icon name={icon} className="h-8 w-8 text-slate-400" />
      </div>
      <p className="mt-4 text-[17px] font-semibold text-slate-800 dark:text-slate-100 lg:text-[15px]">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  );
}

/** Large title (iOS) that reads as a window section title on desktop. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white lg:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Segmented control (NSSegmentedControl / UISegmentedControl). */
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-black/[0.06] p-[3px] dark:bg-white/[0.08]', className)} role="tablist">
      {options.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            'whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-sm font-medium transition',
            value === t.value ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,.12),0_0_0_0.5px_rgba(0,0,0,.04)] dark:bg-white/20 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return <Segmented options={tabs} value={value} onChange={onChange} className="mb-5 flex w-full sm:inline-flex sm:w-auto" />;
}

/** Inset grouped list (iOS Settings / macOS System Settings). */
export function List({ children, className, header, footer }) {
  return (
    <div className={className}>
      {header && <div className="mb-1.5 px-4 text-sm font-medium uppercase tracking-wide text-slate-500 lg:px-1 lg:text-xs">{header}</div>}
      <div className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-black/[0.06] dark:divide-white/[0.06] dark:bg-slate-900 dark:ring-white/[0.07]">{children}</div>
      {footer && <div className="mt-1.5 px-4 text-xs text-slate-500 lg:px-1">{footer}</div>}
    </div>
  );
}

// Minimal inline icon set (Heroicons-style outline paths) – no icon dependency.
const PATHS = {
  x: 'M6 18 18 6M6 6l12 12',
  home: 'm2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  play: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z',
  user: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
  timeline: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12',
  history: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
  wrench: 'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26',
  shield: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
  sun: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  moon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z',
  tv: 'M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125Z',
  flag: 'M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5',
  search: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  trash: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  lock: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z',
  check: 'm4.5 12.75 6 6 9-13.5',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  map: 'M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z',
  book: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
  download: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3',
  bell: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
  logout: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
  inbox: 'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z',
  edit: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10',
  stop: 'M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z',
  menu: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  expand: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
  photo: 'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
  photos: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V8.25A2.25 2.25 0 0 0 20.25 6H3.75A2.25 2.25 0 0 0 1.5 8.25v10.5A2.25 2.25 0 0 0 3.75 21Z M6 3h12',
  camera: 'M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
  upload: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5',
  sidebar: 'M3.75 5.25h16.5a.75.75 0 0 1 .75.75v12a.75.75 0 0 1-.75.75H3.75a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Z M9 5.25v13.5',
  more: 'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
  chevron: 'm8.25 4.5 7.5 7.5-7.5 7.5',
  grid: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Z M3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Z M13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Z M13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
  link: 'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.7 }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={strokeWidth} stroke="currentColor" aria-hidden="true">
      {PATHS[name]?.split(' M').map((d, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={i ? 'M' + d : d} />)}
    </svg>
  );
}

import { Button, Icon, Input } from './ui';

/** Editable key/value rows for locked parameters. */
export function ParamEditor({ value, onChange }) {
  const rows = value.length ? value : [{ key: '', value: '' }];
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Parameter (e.g. Temp)" value={r.key} onChange={(e) => set(i, { key: e.target.value })} className="min-w-0 flex-1" />
          <Input placeholder="Value (e.g. 4 °C)" value={r.value} onChange={(e) => set(i, { value: e.target.value })} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-lg px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
            aria-label="Remove parameter"
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        <Icon name="plus" className="h-4 w-4" /> Add parameter
      </Button>
    </div>
  );
}

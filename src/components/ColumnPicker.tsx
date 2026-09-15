'use client';

import { humanize, type ColumnMeta } from '@/lib/schema';
import { BUTTON, MENU } from './ui';

interface Props {
  columns: ColumnMeta[];
  hidden: Set<string>;
  onChange: (hidden: Set<string>) => void;
}

export function ColumnPicker({ columns, hidden, onChange }: Props) {
  const toggle = (name: string) => {
    const next = new Set(hidden);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  return (
    <details className='relative'>
      <summary className={`${BUTTON} list-none`}>
        Columns{hidden.size ? ` (${columns.length - hidden.size}/${columns.length})` : ''}
      </summary>
      <div className={`${MENU} max-h-80 w-72 overflow-y-auto p-2`}>
        <div className='flex items-center justify-between px-2 pb-2 text-xs'>
          <span className='font-semibold'>Show columns</span>
          <button
            type='button'
            onClick={() => onChange(new Set())}
            className='text-signal hover:underline'
          >
            Show all
          </button>
        </div>
        {columns.map((column) => (
          <label
            key={column.name}
            className='dark:hover:bg-surface-dark flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50'
          >
            <input
              type='checkbox'
              checked={!hidden.has(column.name)}
              onChange={() => toggle(column.name)}
            />
            <span>{humanize(column.name)}</span>
            <span className='text-muted dark:text-muted-dark ml-auto text-[10px]'>
              {column.scalar}
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

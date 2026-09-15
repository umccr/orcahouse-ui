'use client';

import { humanize, isNumericScalar, sortPrefix, type ColumnMeta } from '@/lib/schema';

interface Props {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  sort: string | null;
  canSort: (column: string) => boolean;
  onSort: (column: string) => void;
  loading: boolean;
}

function formatCell(value: unknown, scalar: string): string {
  if (value === null || value === undefined) return '';
  if (scalar === 'Datetime' && typeof value === 'string') {
    return value.replace('T', ' ').replace(/\.\d+/, '');
  }
  if (scalar === 'Int' || scalar === 'BigInt') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-AU') : String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const ARROW = { ascending: '▲', descending: '▼', none: '↕' } as const;

export function DataTable({ columns, rows, sort, canSort, onSort, loading }: Props) {
  return (
    <div className='border-line bg-surface dark:border-line-dark dark:bg-surface-dark overflow-x-auto rounded-lg border'>
      <table className='min-w-full border-collapse text-left text-sm'>
        <thead className='text-muted dark:bg-raised-dark dark:text-muted-dark bg-slate-50 text-xs tracking-wide uppercase'>
          <tr>
            {columns.map((column) => {
              const prefix = sortPrefix(column.name);
              const direction =
                sort === `${prefix}_ASC`
                  ? 'ascending'
                  : sort === `${prefix}_DESC`
                    ? 'descending'
                    : 'none';
              const sortable = canSort(column.name);
              return (
                <th
                  key={column.name}
                  scope='col'
                  aria-sort={sortable ? direction : undefined}
                  className='border-line dark:border-line-dark border-b px-3 py-2 font-semibold whitespace-nowrap'
                >
                  <button
                    type='button'
                    disabled={!sortable}
                    onClick={() => onSort(column.name)}
                    className='inline-flex cursor-pointer items-center gap-1 disabled:cursor-default'
                  >
                    {humanize(column.name)}
                    {sortable && (
                      <span
                        aria-hidden='true'
                        className={direction === 'none' ? 'opacity-30' : 'text-signal'}
                      >
                        {ARROW[direction]}
                      </span>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={Math.max(columns.length, 1)}
                className='text-muted dark:text-muted-dark px-3 py-10 text-center'
              >
                {loading ? 'Loading rows…' : 'No rows match the current filters.'}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={index}
              className='border-line dark:border-line-dark dark:hover:bg-raised-dark/60 border-b last:border-b-0 hover:bg-slate-50'
            >
              {columns.map((column) => {
                const text = formatCell(row[column.name], column.scalar);
                const numeric = isNumericScalar(column.scalar);
                return (
                  <td
                    key={column.name}
                    title={text}
                    className={`max-w-[28rem] truncate px-3 py-1.5 font-mono text-xs ${
                      numeric ? 'text-right tabular-nums' : ''
                    }`}
                  >
                    {text === '' ? (
                      <span className='text-muted/60 dark:text-muted-dark/60 italic'>null</span>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

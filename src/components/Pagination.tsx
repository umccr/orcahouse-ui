'use client';

import { BUTTON, INPUT } from './ui';

export const PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 25;

interface Props {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

const num = (value: number) => value.toLocaleString('en-AU');

export function Pagination({ page, size, total, onPage, onSize }: Props) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div className='text-muted dark:text-muted-dark flex flex-wrap items-center justify-between gap-3 text-xs'>
      <div>
        Showing{' '}
        <span className='text-ink dark:text-ink-dark font-medium'>
          {num(from)}–{num(to)}
        </span>{' '}
        of <span className='text-ink dark:text-ink-dark font-medium'>{num(total)}</span>
      </div>
      <div className='flex items-center gap-2'>
        <label className='flex items-center gap-1'>
          Rows
          <select
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
            className={INPUT}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type='button'
          className={BUTTON}
          disabled={page <= 1}
          onClick={() => onPage(1)}
          aria-label='First page'
        >
          «
        </button>
        <button
          type='button'
          className={BUTTON}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label='Previous page'
        >
          ‹
        </button>
        <span>
          Page {num(page)} of {num(pages)}
        </span>
        <button
          type='button'
          className={BUTTON}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label='Next page'
        >
          ›
        </button>
        <button
          type='button'
          className={BUTTON}
          disabled={page >= pages}
          onClick={() => onPage(pages)}
          aria-label='Last page'
        >
          »
        </button>
      </div>
    </div>
  );
}

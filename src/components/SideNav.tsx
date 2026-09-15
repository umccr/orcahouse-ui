'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Search, X } from 'lucide-react';
import { useCollapsedGroups } from '@/hooks/useCollapsedGroups';
import { useMartSchema } from '@/hooks/useMartSchema';
import { GROUPS, resolveCatalog, tableHref } from '@/lib/catalog';
import { searchTables } from '@/lib/table-search';
import { INPUT } from './ui';

/** A table name with its matched characters marked. */
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return text;
  const marked = new Set(indices);
  const parts: { text: string; match: boolean }[] = [];
  Array.from(text).forEach((char, index) => {
    const match = marked.has(index);
    const last = parts.at(-1);
    if (last?.match === match) last.text += char;
    else parts.push({ text: char, match });
  });
  return parts.map((part, i) =>
    part.match ? (
      <mark key={i} className='bg-signal/20 rounded-[2px] text-inherit'>
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

/**
 * Table tree mirroring the dbt mart folder layout, with a fuzzy search and foldable groups.
 * Hidden on narrow screens.
 */
export function SideNav() {
  const activeTable = useSearchParams().get('table');
  const { schema, collections } = useMartSchema();
  const [query, setQuery] = useState('');
  const [collapsed, toggleGroup] = useCollapsedGroups();

  const tables = useMemo(() => resolveCatalog(schema ? collections : null), [schema, collections]);
  const hits = useMemo(() => searchTables(tables, query), [tables, query]);
  const searching = query.trim() !== '';

  return (
    <nav
      aria-label='Mart tables'
      className='border-line bg-surface dark:border-line-dark dark:bg-surface-dark hidden w-60 shrink-0 border-r lg:block'
    >
      <div className='sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col'>
        <div role='search' className='shrink-0 px-3 pt-4 pb-2'>
          <div className='relative'>
            <Search
              aria-hidden='true'
              className='text-muted dark:text-muted-dark pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2'
            />
            <input
              type='search'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder='Search tables'
              aria-label='Search tables'
              autoComplete='off'
              spellCheck={false}
              className={`${INPUT} w-full pr-7 pl-7 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {query && (
              <button
                type='button'
                onClick={() => setQuery('')}
                aria-label='Clear search'
                className='text-muted dark:text-muted-dark dark:hover:bg-raised-dark absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1 hover:bg-slate-100'
              >
                <X className='h-3 w-3' aria-hidden='true' />
              </button>
            )}
          </div>
          <p aria-live='polite' className='sr-only'>
            {searching
              ? `${hits.length} ${hits.length === 1 ? 'table matches' : 'tables match'}`
              : ''}
          </p>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-3 pb-4'>
          <Link
            href='/'
            className={`block rounded-md px-2 py-1 text-xs font-semibold ${
              !activeTable
                ? 'bg-signal/10 text-signal'
                : 'dark:hover:bg-raised-dark hover:bg-slate-100'
            }`}
          >
            All tables
          </Link>

          {searching && !hits.length && (
            <p className='text-muted dark:text-muted-dark px-2 py-3 text-xs'>
              No tables match &ldquo;{query.trim()}&rdquo;.
            </p>
          )}

          {GROUPS.map((group) => {
            const rows = hits.filter((hit) => hit.table.group === group.id);
            if (!rows.length) return null;
            const listId = `sidenav-group-${group.id}`;
            // Search results always show; otherwise the user's fold applies.
            const expanded = searching || !collapsed.has(group.id);
            const holdsActivePage = rows.some(({ table }) => table.table === activeTable);
            return (
              <div key={group.id} className='mt-3'>
                <button
                  type='button'
                  onClick={() => toggleGroup(group.id)}
                  disabled={searching}
                  aria-expanded={expanded}
                  aria-controls={listId}
                  className={`dark:enabled:hover:bg-raised-dark flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-[10px] font-semibold tracking-wider uppercase enabled:cursor-pointer enabled:hover:bg-slate-100 ${
                    holdsActivePage && !expanded ? 'text-signal' : 'text-muted dark:text-muted-dark'
                  }`}
                >
                  <ChevronRight
                    aria-hidden='true'
                    className={`h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''} ${
                      searching ? 'invisible' : ''
                    }`}
                  />
                  <span className='truncate'>{group.label}</span>
                  <span className='ml-auto pr-1 font-normal tabular-nums'>{rows.length}</span>
                </button>
                <ul id={listId} hidden={!expanded} className='mt-0.5'>
                  {rows.map(({ table: t, indices }) => {
                    const active = t.table === activeTable;
                    const unavailable = t.available === false;
                    return (
                      <li key={t.table}>
                        <Link
                          href={tableHref(t.table)}
                          aria-current={active ? 'page' : undefined}
                          title={unavailable ? 'Not in the live API schema' : t.description}
                          className={`flex items-center gap-2 rounded-md py-1 pr-2 pl-5 font-mono text-xs ${
                            active
                              ? 'bg-signal/10 text-signal font-semibold'
                              : 'dark:hover:bg-raised-dark hover:bg-slate-100'
                          } ${unavailable ? 'opacity-40' : ''}`}
                        >
                          <span className='truncate'>
                            <Highlight text={t.table} indices={indices} />
                          </span>
                          {t.status === 'DEMO' && (
                            <span className='ml-auto text-[9px] font-semibold text-amber-600 dark:text-amber-400'>
                              DEMO
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

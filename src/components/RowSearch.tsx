'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { humanize, type FilterFieldMeta } from '@/lib/schema';
import { INPUT } from './ui';

/** How long typing must pause before the search runs, so not every keystroke is a query. */
const DEBOUNCE_MS = 400;

interface Props {
  /** Columns the API can search. */
  fields: FilterFieldMeta[];
  column: string;
  /** The search text in the URL. */
  text: string;
  onColumnChange: (column: string) => void;
  onSearch: (text: string) => void;
}

/**
 * Search box for rows whose value in the chosen column contains the text, ignoring case.
 * Typing searches once it pauses and Enter searches at once. The search lives in the URL,
 * so it can be shared and follows back and forward.
 */
export function RowSearch({ fields, column, text, onColumnChange, onSearch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(text);
  // Searches sent to the URL that have not shown up in it yet, oldest first.
  const [pending, setPending] = useState<string[]>([]);
  const [seenText, setSeenText] = useState(text);

  // The URL text changed. One of our own searches arriving leaves the draft alone, as the
  // user may have typed on since; any other change, such as back or forward, replaces it.
  if (text !== seenText) {
    setSeenText(text);
    const own = pending.indexOf(text);
    if (own >= 0) {
      setPending(pending.slice(own + 1));
    } else {
      setPending([]);
      setDraft(text);
    }
  }

  // The text the URL will have once the pending searches arrive.
  const target = pending.at(-1) ?? text;

  const submit = (value: string) => {
    const next = value.trim();
    if (next === target) return;
    setPending([...pending, next]);
    onSearch(next);
  };

  const submitDraft = useEffectEvent(() => submit(draft));
  useEffect(() => {
    if (draft.trim() === target) return;
    const timer = setTimeout(() => submitDraft(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, target]);

  const clear = () => {
    setDraft('');
    submit('');
  };

  return (
    <form
      role='search'
      aria-label='Search rows'
      onSubmit={(event) => {
        event.preventDefault();
        submit(draft);
      }}
      className='flex w-full flex-wrap items-center gap-2 sm:w-auto'
    >
      <select
        value={column}
        onChange={(event) => onColumnChange(event.target.value)}
        aria-label='Column to search'
        className={`${INPUT} min-w-[12rem]`}
      >
        {fields.map((field) => (
          <option key={field.name} value={field.name}>
            {humanize(field.name)}
          </option>
        ))}
      </select>
      <div className='relative w-full sm:w-md'>
        <Search
          aria-hidden='true'
          className='text-muted dark:text-muted-dark pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2'
        />
        <input
          ref={inputRef}
          type='search'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') clear();
          }}
          placeholder={`${humanize(column)} contains…`}
          aria-label={`Search ${humanize(column)}`}
          title='Matches anywhere in the value, ignoring case'
          enterKeyHint='search'
          autoComplete='off'
          spellCheck={false}
          className={`${INPUT} w-full pr-7 pl-7 [&::-webkit-search-cancel-button]:appearance-none`}
        />
        {draft && (
          <button
            type='button'
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            aria-label='Clear search'
            className='text-muted dark:text-muted-dark dark:hover:bg-raised-dark absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1 hover:bg-slate-100'
          >
            <X className='h-3 w-3' aria-hidden='true' />
          </button>
        )}
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import {
  isComplete,
  parseFilterState,
  serializeFilter,
  type FilterItem,
  type FilterState,
} from '@/lib/filters';
import {
  humanize,
  isNumericScalar,
  isTemporalScalar,
  OPERATOR_LABELS,
  type FilterFieldMeta,
} from '@/lib/schema';
import { BUTTON, BUTTON_PRIMARY, INPUT } from './ui';

interface Props {
  fields: FilterFieldMeta[];
  /** Filter JSON currently in the URL; remount (via `key`) when it changes. */
  initial: string | null;
  onApply: (json: string | null) => void;
}

/**
 * Edits a flat list of `field operator value` clauses combined with AND or OR, the
 * shape the PostGraphile connection-filter plugin accepts. Nothing is sent until Apply.
 */
export function FilterBuilder({ fields, initial, onApply }: Props) {
  const [state, setState] = useState<FilterState>(() => parseFilterState(initial));
  const [nextField, setNextField] = useState(fields[0]?.name ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const meta = (name: string) => fields.find((f) => f.name === name);

  const setItem = (index: number, patch: Partial<FilterItem>) =>
    setState((s) => ({
      ...s,
      items: s.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const removeItem = (index: number) =>
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== index) }));

  const addItem = () => {
    const field = meta(nextField);
    if (!field) return;
    setState((s) => ({
      ...s,
      items: [...s.items, { field: field.name, operator: field.operators[0], value: '' }],
    }));
  };

  const apply = () => {
    if (state.items.some((item) => !isComplete(item))) {
      setMessage('Every filter needs a value.');
      return;
    }
    setMessage(null);
    const json = serializeFilter(state, fields);
    onApply(json ? JSON.stringify(json) : null);
  };

  return (
    <section className='border-line bg-surface dark:border-line-dark dark:bg-surface-dark rounded-lg border p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold'>Filters</h2>
        <label className='text-muted dark:text-muted-dark flex items-center gap-2 text-xs'>
          Combine with
          <select
            value={state.op}
            onChange={(event) =>
              setState((s) => ({ ...s, op: event.target.value as FilterState['op'] }))
            }
            className={INPUT}
          >
            <option value='and'>AND</option>
            <option value='or'>OR</option>
          </select>
        </label>
      </div>

      <ul className='mt-3 space-y-2'>
        {state.items.map((item, index) => {
          const field = meta(item.field);
          if (!field) return null;
          return (
            <li key={index} className='flex flex-wrap items-center gap-2'>
              <select
                value={item.field}
                onChange={(event) => {
                  const next = meta(event.target.value);
                  if (!next) return;
                  setItem(index, {
                    field: next.name,
                    operator: next.operators.includes(item.operator)
                      ? item.operator
                      : next.operators[0],
                    value: '',
                  });
                }}
                className={`${INPUT} min-w-[12rem]`}
              >
                {fields.map((f) => (
                  <option key={f.name} value={f.name}>
                    {humanize(f.name)}
                  </option>
                ))}
              </select>

              <select
                value={item.operator}
                onChange={(event) => {
                  const operator = event.target.value;
                  const value =
                    operator === 'isNull' ? 'false' : item.operator === 'isNull' ? '' : item.value;
                  setItem(index, { operator, value });
                }}
                className={INPUT}
              >
                {field.operators.map((op) => (
                  <option key={op} value={op}>
                    {OPERATOR_LABELS[op] ?? op}
                  </option>
                ))}
              </select>

              <ValueInput
                field={field}
                item={item}
                onChange={(value) => setItem(index, { value })}
              />

              <button
                type='button'
                onClick={() => removeItem(index)}
                className={BUTTON}
                aria-label='Remove filter'
              >
                ✕
              </button>
            </li>
          );
        })}
        {state.items.length === 0 && (
          <li className='text-muted dark:text-muted-dark text-xs'>No filters. Add one below.</li>
        )}
      </ul>

      <div className='mt-3 flex flex-wrap items-center gap-2'>
        <select
          value={nextField}
          onChange={(event) => setNextField(event.target.value)}
          className={`${INPUT} min-w-[12rem]`}
        >
          {fields.map((f) => (
            <option key={f.name} value={f.name}>
              {humanize(f.name)}
            </option>
          ))}
        </select>
        <button type='button' onClick={addItem} className={BUTTON}>
          + Add filter
        </button>
        <span className='flex-1' />
        {message && <span className='text-xs text-red-600 dark:text-red-300'>{message}</span>}
        <button type='button' onClick={() => onApply(null)} className={BUTTON}>
          Reset
        </button>
        <button type='button' onClick={apply} className={BUTTON_PRIMARY}>
          Apply
        </button>
      </div>
    </section>
  );
}

function ValueInput({
  field,
  item,
  onChange,
}: {
  field: FilterFieldMeta;
  item: FilterItem;
  onChange: (value: string) => void;
}) {
  if (item.operator === 'isNull') {
    return (
      <select
        value={item.value || 'false'}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      >
        <option value='false'>is not null</option>
        <option value='true'>is null</option>
      </select>
    );
  }
  if (field.scalar === 'Boolean') {
    return (
      <select value={item.value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        <option value=''>choose…</option>
        <option value='true'>true</option>
        <option value='false'>false</option>
      </select>
    );
  }
  const temporal = isTemporalScalar(field.scalar);
  return (
    <input
      type={temporal ? 'date' : isNumericScalar(field.scalar) ? 'number' : 'text'}
      value={item.value}
      onChange={(e) => onChange(e.target.value)}
      placeholder='value'
      title={temporal ? 'Dates are compared in UTC' : undefined}
      className={`${INPUT} min-w-[12rem]`}
    />
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@apollo/client/react';
import { useMartSchema } from '@/hooks/useMartSchema';
import { groupById, resolveCatalog } from '@/lib/catalog';
import { downloadCsv } from '@/lib/csv';
import { parseFilterJson } from '@/lib/filters';
import {
  buildRowsQuery,
  EMPTY_QUERY,
  type RowsResult,
  type RowsVariables,
} from '@/lib/query-builder';
import {
  filterFields,
  humanize,
  isTemporalScalar,
  nodeColumns,
  orderByValues,
  sortPrefix,
  type ColumnMeta,
} from '@/lib/schema';
import { ColumnPicker } from './ColumnPicker';
import { DataTable } from './DataTable';
import { ErrorNotice } from './ErrorNotice';
import { FilterBuilder } from './FilterBuilder';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, Pagination } from './Pagination';
import { StatusBadge } from './StatusBadge';
import { BUTTON } from './ui';

interface Props {
  table: string;
}

type Patch = Record<string, string | null>;

/** Newest first on the catalogue's preferred key, else on the first temporal column. */
function pickDefaultSort(
  preferred: string | undefined,
  sortValues: string[],
  columns: ColumnMeta[]
): string | null {
  if (preferred && sortValues.includes(preferred)) return preferred;
  for (const column of columns) {
    const candidate = `${sortPrefix(column.name)}_DESC`;
    if (isTemporalScalar(column.scalar) && sortValues.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Generic browser for one mart table. Column, filter and sort metadata come from the
 * introspected schema; page, size, sort and filter live in the URL so views can be shared.
 */
export function TableBrowser({ table }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { schema, collections, loading: schemaLoading, error: schemaError } = useMartSchema();

  const entry = useMemo(
    () => resolveCatalog(schema ? collections : null).find((t) => t.table === table),
    [schema, collections, table]
  );
  const collection = useMemo(
    () => collections.find((c) => c.field === entry?.collection),
    [collections, entry]
  );

  const columns = useMemo(
    () => (schema && collection ? nodeColumns(schema, collection.nodeType) : []),
    [schema, collection]
  );
  const filterMeta = useMemo(
    () => (schema && collection ? filterFields(schema, collection.filterType) : []),
    [schema, collection]
  );
  const sortValues = useMemo(
    () => (schema && collection ? orderByValues(schema, collection.orderByType) : []),
    [schema, collection]
  );

  const page = Math.max(1, Number(params.get('page')) || 1);
  const sizeParam = Number(params.get('size'));
  const size = PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const sort = params.get('sort');
  const filterRaw = params.get('filter');
  const filter = useMemo(() => parseFilterJson(filterRaw), [filterRaw]);

  const update = useCallback(
    (patch: Patch, replace = false) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const url = next.size ? `${pathname}?${next.toString()}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router]
  );

  // First visit: sort newest first and hide rows with a null sort key, as the legacy portal did.
  const defaultSort = pickDefaultSort(entry?.defaultSort, sortValues, columns);
  useEffect(() => {
    if (!collection || sort || filterRaw || !defaultSort) return;
    const prefix = defaultSort.replace(/_(ASC|DESC)$/, '');
    const column = columns.find((c) => sortPrefix(c.name) === prefix);
    const patch: Patch = { sort: defaultSort };
    if (column) patch.filter = JSON.stringify({ and: [{ [column.name]: { isNull: false } }] });
    update(patch, true);
  }, [collection, columns, defaultSort, filterRaw, sort, update]);

  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const visible = useMemo(() => columns.filter((c) => !hidden.has(c.name)), [columns, hidden]);

  const document = useMemo(
    () =>
      collection && columns.length
        ? buildRowsQuery(
            collection,
            columns.map((c) => c.name)
          )
        : null,
    [collection, columns]
  );
  const variables: RowsVariables = {
    first: size,
    offset: (page - 1) * size,
    orderBy: sort ? [sort] : undefined,
    filter: filter ?? undefined,
  };
  const { data, previousData, loading, error, refetch } = useQuery<RowsResult, RowsVariables>(
    document ?? EMPTY_QUERY,
    { variables, skip: !document, notifyOnNetworkStatusChange: true }
  );

  const result = data?.rows ?? previousData?.rows;
  const rows = useMemo(() => result?.nodes ?? [], [result]);
  const total = result?.totalCount ?? 0;
  const clauses = filter?.and ?? filter?.or;
  const filterCount = Array.isArray(clauses) ? clauses.length : 0;

  const canSort = (column: string) => sortValues.includes(`${sortPrefix(column)}_DESC`);
  const onSort = (column: string) => {
    const prefix = sortPrefix(column);
    update({ sort: sort === `${prefix}_DESC` ? `${prefix}_ASC` : `${prefix}_DESC`, page: null });
  };
  const exportCsv = () =>
    downloadCsv(
      `${table}-page${page}-${new Date().toISOString().slice(0, 10)}.csv`,
      visible.map((c) => ({ key: c.name, header: humanize(c.name) })),
      rows
    );

  if (schemaError) {
    return <ErrorNotice title='Could not load the mart schema' message={schemaError.message} />;
  }

  if (!entry) {
    if (!schema) {
      return <p className='text-muted dark:text-muted-dark text-sm'>Loading schema…</p>;
    }
    return (
      <ErrorNotice title='Unknown table' message={`No mart table "${table}".`}>
        <Link href='/' className='text-signal hover:underline'>
          Back to all tables
        </Link>
      </ErrorNotice>
    );
  }

  return (
    <div className='space-y-4'>
      <nav className='text-muted dark:text-muted-dark text-xs' aria-label='Breadcrumb'>
        <Link href='/' className='hover:underline'>
          Mart
        </Link>
        <span className='mx-1'>/</span>
        <span>{groupById(entry.group)?.label ?? entry.group}</span>
        <span className='mx-1'>/</span>
        <span className='font-mono'>{entry.table}</span>
      </nav>

      <header className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h1 className='flex items-center gap-2 font-mono text-xl font-bold'>
            {entry.table}
            <StatusBadge status={entry.status} />
          </h1>
          <p className='text-muted dark:text-muted-dark mt-1 max-w-3xl text-sm'>
            {entry.description}
          </p>
          <p className='text-muted dark:text-muted-dark mt-1 text-xs'>
            API field <code className='font-mono'>{entry.collection}</code> · refreshed daily by the
            warehouse pipeline
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button type='button' className={BUTTON} onClick={() => setFiltersOpen((o) => !o)}>
            Filters{filterCount ? ` (${filterCount})` : ''}
          </button>
          <ColumnPicker columns={columns} hidden={hidden} onChange={setHidden} />
          <button type='button' className={BUTTON} onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </button>
          <button
            type='button'
            className={BUTTON}
            onClick={() => void refetch()}
            disabled={loading || !document}
          >
            Refresh
          </button>
        </div>
      </header>

      {schema && !collection && (
        <ErrorNotice
          title='Not exposed by the API'
          message={`The live schema has no "${entry.collection}" field, so this table is not deployed in the mart schema yet.`}
        />
      )}

      {filtersOpen && collection && (
        <FilterBuilder
          key={filterRaw ?? ''}
          fields={filterMeta}
          initial={filterRaw}
          onApply={(json) => update({ filter: json, page: null })}
        />
      )}

      {error && <ErrorNotice title='Query failed' message={error.message} />}

      {collection && (
        <>
          <DataTable
            columns={visible}
            rows={rows}
            sort={sort}
            canSort={canSort}
            onSort={onSort}
            loading={loading || (schemaLoading && !schema)}
          />
          <Pagination
            page={page}
            size={size}
            total={total}
            onPage={(p) => update({ page: p === 1 ? null : String(p) })}
            onSize={(s) => update({ size: s === DEFAULT_PAGE_SIZE ? null : String(s), page: null })}
          />
        </>
      )}
    </div>
  );
}

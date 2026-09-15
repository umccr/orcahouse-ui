'use client';

import Link from 'next/link';
import { useMartSchema } from '@/hooks/useMartSchema';
import { GROUPS, resolveCatalog, tableHref } from '@/lib/catalog';
import { ErrorNotice } from './ErrorNotice';
import { StatusBadge } from './StatusBadge';

export function CatalogHome() {
  const { schema, collections, error } = useMartSchema();
  const tables = resolveCatalog(schema ? collections : null);
  const liveCount = tables.filter((t) => t.available).length;

  const schemaNote = schema
    ? `${liveCount} of ${tables.length} tables are live in the API schema.`
    : error
      ? 'The live schema is unavailable.'
      : 'Loading the live schema…';

  return (
    <div className='space-y-8'>
      <section>
        <h1 className='text-2xl font-bold tracking-tight'>OrcaVault mart tables</h1>
        <p className='text-muted dark:text-muted-dark mt-2 max-w-3xl text-sm'>
          Browse the consumer-facing tables of the OrcaHouse data warehouse. Every table is served
          by the mart GraphQL API and refreshed daily by the warehouse pipeline.
        </p>
        <p className='text-muted dark:text-muted-dark mt-2 text-xs'>{schemaNote}</p>
      </section>

      {error && <ErrorNotice title='Could not load the mart schema' message={error.message} />}

      <div className='grid gap-6 md:grid-cols-2 xl:grid-cols-3'>
        {GROUPS.map((group) => {
          const rows = tables.filter((t) => t.group === group.id);
          if (!rows.length) return null;
          return (
            <section
              key={group.id}
              className='border-line bg-surface dark:border-line-dark dark:bg-surface-dark rounded-xl border p-5'
            >
              <h2 className='text-base font-semibold'>{group.label}</h2>
              <p className='text-muted dark:text-muted-dark mt-0.5 text-xs'>{group.blurb}</p>
              <ul className='divide-line dark:divide-line-dark mt-4 divide-y'>
                {rows.map((t) => (
                  <li key={t.table} className='py-2.5'>
                    {t.available === false ? (
                      <div className='opacity-50' title='Not in the live API schema'>
                        <span className='font-mono text-sm'>{t.table}</span>
                        <span className='ml-2 text-[10px] font-semibold uppercase'>not in API</span>
                      </div>
                    ) : (
                      <Link href={tableHref(t.table)} className='group block'>
                        <div className='flex items-center justify-between gap-2'>
                          <span className='text-signal font-mono text-sm font-medium group-hover:underline'>
                            {t.table}
                          </span>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className='text-muted dark:text-muted-dark mt-0.5 line-clamp-2 text-xs'>
                          {t.description}
                        </p>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

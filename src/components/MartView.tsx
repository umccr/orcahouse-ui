'use client';

import { useSearchParams } from 'next/navigation';
import { CatalogHome } from './CatalogHome';
import { TableBrowser } from './TableBrowser';

/**
 * The app's one static page: the catalogue, or a table when the URL names one (`?table=`).
 * A single index.html is what the portal's CloudFront rewrite serves for every path under
 * /mart/, and it keeps tables the build does not know about browsable.
 */
export function MartView() {
  const table = useSearchParams().get('table');

  return (
    <>
      <title>{table ? `${table} · OrcaHouse` : 'OrcaHouse'}</title>
      {/* Keyed so switching tables starts from fresh column and filter state. */}
      {table ? <TableBrowser key={table} table={table} /> : <CatalogHome />}
    </>
  );
}

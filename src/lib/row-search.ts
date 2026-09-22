import type { FilterFieldMeta } from './schema';

/**
 * Row search: rows whose value in one text column contains the search text, ignoring case.
 *
 * It is a connection-filter operator, which PostGraphile runs as `ILIKE '%text%'` with any
 * `%` and `_` in the text escaped, so the text always matches literally. The API has to
 * allow the operator (connectionFilterAllowedOperators in the orcahouse API server); where
 * it does not, no column offers it and the UI hides the search box.
 */
export const SEARCH_OPERATOR = 'includesInsensitive';

/** Most mart tables are keyed by library, so the search starts on this column when present. */
const PREFERRED_COLUMN = 'libraryId';

/** The filter fields the API can search, which are the text columns. */
export function searchableFields(fields: FilterFieldMeta[]): FilterFieldMeta[] {
  return fields.filter((field) => field.operators.includes(SEARCH_OPERATOR));
}

/**
 * The requested column if it is searchable, else libraryId, else the first searchable
 * column. Null when the table has none.
 */
export function pickSearchColumn(
  fields: FilterFieldMeta[],
  requested?: string | null
): string | null {
  const names = fields.map((field) => field.name);
  if (requested && names.includes(requested)) return requested;
  return names.includes(PREFERRED_COLUMN) ? PREFERRED_COLUMN : (names[0] ?? null);
}

/** The filter clause for a search, or null when there is no column or no text. */
export function searchClause(column: string | null, text: string): Record<string, unknown> | null {
  const value = text.trim();
  return column && value ? { [column]: { [SEARCH_OPERATOR]: value } } : null;
}

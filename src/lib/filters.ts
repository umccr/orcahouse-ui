import type { FilterFieldMeta } from './schema';

/**
 * Filter state for the query builder.
 *
 * The URL carries the ready-to-send GraphQL filter input as JSON (for example
 * `{"and":[{"libraryId":{"equalTo":"L2400001"}}]}`), the same convention the legacy
 * portal used, so links stay shareable. These helpers convert between that JSON and the
 * flat list the builder edits.
 */
export interface FilterItem {
  field: string;
  operator: string;
  value: string;
}

export interface FilterState {
  op: 'and' | 'or';
  items: FilterItem[];
}

export function parseFilterJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseFilterState(raw: string | null): FilterState {
  const json = parseFilterJson(raw);
  const op: FilterState['op'] = json && 'or' in json ? 'or' : 'and';
  const clauses = Array.isArray(json?.[op]) ? (json[op] as unknown[]) : [];
  const items: FilterItem[] = [];

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object') continue;
    const [field, operators] = Object.entries(clause)[0] ?? [];
    if (!field || !operators || typeof operators !== 'object') continue;
    const [operator, value] = Object.entries(operators as object)[0] ?? [];
    if (!operator) continue;
    items.push({
      field,
      operator,
      value: value === null || value === undefined ? '' : String(value),
    });
  }

  return { op, items };
}

/** Converts the text input into the JSON type the API expects for the column. */
export function coerceValue(scalar: string, operator: string, value: string): unknown {
  if (operator === 'isNull') return value === 'true';
  if (scalar === 'Int' || scalar === 'Float') return Number(value);
  if (scalar === 'Boolean') return value === 'true';
  // String, Date, Datetime, BigInt, BigFloat and UUID are all sent as strings.
  return value;
}

export function isComplete(item: FilterItem): boolean {
  return item.operator === 'isNull'
    ? item.value === 'true' || item.value === 'false'
    : item.value.trim() !== '';
}

export function serializeFilter(
  state: FilterState,
  fields: FilterFieldMeta[]
): Record<string, unknown> | null {
  const clauses = state.items.flatMap((item) => {
    const meta = fields.find((f) => f.name === item.field);
    if (!meta || !isComplete(item)) return [];
    return [
      { [item.field]: { [item.operator]: coerceValue(meta.scalar, item.operator, item.value) } },
    ];
  });
  return clauses.length ? { [state.op]: clauses } : null;
}

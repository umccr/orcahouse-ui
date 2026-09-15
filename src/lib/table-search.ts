import { groupById, type ResolvedTable } from './catalog';

export interface FuzzyMatch {
  score: number;
  /** Positions of the matched characters in the text, ascending. */
  indices: number[];
}

const isWordStart = (text: string, index: number) =>
  index === 0 || !/[a-z0-9]/i.test(text.charAt(index - 1));

/**
 * Case-insensitive fuzzy match. A substring wins outright; otherwise the query's characters
 * must appear in the text in order, the first at the start of a word, so "fqh" finds
 * "fastq_history". Consecutive characters and word starts score higher, gaps lower.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, indices: [] };

  const at = t.indexOf(q);
  if (at >= 0) {
    const score = 1000 + (isWordStart(t, at) ? 100 : 0) - at - (t.length - q.length);
    return { score, indices: Array.from(q, (_, i) => at + i) };
  }

  let start = t.indexOf(q[0]);
  while (start >= 0 && !isWordStart(t, start)) start = t.indexOf(q[0], start + 1);
  if (start < 0) return null;

  const indices = [start];
  let score = 30 - Math.min(start, 9);
  let from = start + 1;
  for (const char of q.slice(1)) {
    const index = t.indexOf(char, from);
    if (index < 0) return null;
    score += 10 - Math.min(index - from, 9);
    if (index === from) score += 15;
    if (isWordStart(t, index)) score += 20;
    indices.push(index);
    from = index + 1;
  }
  return { score, indices };
}

export interface TableHit {
  table: ResolvedTable;
  /** Positions in the table name to highlight. */
  indices: number[];
}

const GROUP_SCORE = 60;
const DESCRIPTION_SCORE = 20;

/**
 * Tables matching every whitespace-separated term of the query, best first. A term matches
 * the table name, or (from three characters) appears in the group label or the description,
 * which rank lower. Scattered fuzzy name matches only count for a term that no table name
 * contains outright. An empty query returns every table in catalogue order.
 */
export function searchTables(tables: ResolvedTable[], query: string): TableHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return tables.map((table) => ({ table, indices: [] }));

  const literal = new Set(
    terms.filter((term) => tables.some(({ table }) => table.toLowerCase().includes(term)))
  );

  const hits: (TableHit & { score: number })[] = [];
  for (const table of tables) {
    const lowerName = table.table.toLowerCase();
    const group = (groupById(table.group)?.label ?? table.group).toLowerCase();
    const description = table.description.toLowerCase();
    const indices = new Set<number>();
    let score = 0;

    const matchesEveryTerm = terms.every((term) => {
      const name =
        !literal.has(term) || lowerName.includes(term) ? fuzzyMatch(term, table.table) : null;
      if (name) {
        score += name.score;
        name.indices.forEach((index) => indices.add(index));
      } else if (term.length >= 3 && group.includes(term)) {
        score += GROUP_SCORE;
      } else if (term.length >= 3 && description.includes(term)) {
        score += DESCRIPTION_SCORE;
      } else {
        return false;
      }
      return true;
    });

    if (matchesEveryTerm) {
      hits.push({ table, score, indices: [...indices].sort((a, b) => a - b) });
    }
  }

  // Array.prototype.sort is stable, so equal scores keep catalogue order.
  return hits.sort((a, b) => b.score - a.score).map(({ table, indices }) => ({ table, indices }));
}

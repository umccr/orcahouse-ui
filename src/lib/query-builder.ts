import { gql } from '@apollo/client';
import type { DocumentNode } from 'graphql';
import type { Collection } from './schema';

export interface RowsResult {
  rows: {
    totalCount: number;
    nodes: Record<string, unknown>[];
  };
}

export interface RowsVariables {
  first: number;
  offset: number;
  orderBy?: string[];
  filter?: Record<string, unknown>;
}

/** Placeholder document for hooks that must be called before a real query is known. */
export const EMPTY_QUERY = gql`
  query Empty {
    __typename
  }
`;

/**
 * Builds the paginated, sortable, filterable query for one collection.
 *
 * The connection is aliased to `rows` so every table shares one result shape. All
 * scalar columns are requested regardless of which ones are shown, so toggling a
 * column never triggers a refetch. The API caps request bodies at 10,000 bytes, which
 * a flat table of a few dozen columns stays well inside of.
 */
export function buildRowsQuery(collection: Collection, columns: string[]): DocumentNode {
  const variables = ['$first: Int!', '$offset: Int!'];
  const args = ['first: $first', 'offset: $offset'];

  if (collection.orderByType) {
    variables.push(`$orderBy: [${collection.orderByType}!]`);
    args.push('orderBy: $orderBy');
  }
  if (collection.filterType) {
    variables.push(`$filter: ${collection.filterType}`);
    args.push('filter: $filter');
  }

  return gql`
    query ${collection.field}Rows(${variables.join(', ')}) {
      rows: ${collection.field}(${args.join(', ')}) {
        totalCount
        nodes {
          ${columns.join('\n          ')}
        }
      }
    }
  `;
}

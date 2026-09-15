import { gql } from '@apollo/client';

/**
 * Runtime introspection of the mart GraphQL schema.
 *
 * PostGraphile generates the API from the `mart` Postgres schema, so tables, columns,
 * filter operators and sort keys change whenever dbt publishes a new model. Reading the
 * schema at runtime keeps this UI generic: browsing a new table needs no query file and
 * no codegen step. The helpers below turn the raw introspection result into the small
 * amount of metadata the table view needs.
 */
export const INTROSPECTION_QUERY = gql`
  query MartSchema {
    __schema {
      queryType {
        name
      }
      types {
        kind
        name
        fields {
          name
          args {
            name
            type {
              ...TypeRef
            }
          }
          type {
            ...TypeRef
          }
        }
        inputFields {
          name
          type {
            ...TypeRef
          }
        }
        enumValues {
          name
        }
      }
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
        }
      }
    }
  }
`;

export interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}

export interface IntrospectionField {
  name: string;
  args?: { name: string; type: TypeRef }[];
  type: TypeRef;
}

export interface IntrospectionType {
  kind: string;
  name: string;
  fields: IntrospectionField[] | null;
  inputFields: { name: string; type: TypeRef }[] | null;
  enumValues: { name: string }[] | null;
}

export interface IntrospectionSchema {
  queryType: { name: string };
  types: IntrospectionType[];
}

export interface IntrospectionResult {
  __schema: IntrospectionSchema;
}

/** One PostGraphile connection field on the root Query type, for example `allLims`. */
export interface Collection {
  field: string;
  nodeType: string;
  filterType: string | null;
  orderByType: string | null;
}

export interface ColumnMeta {
  name: string;
  /** Named scalar type: String, Int, BigInt, BigFloat, Boolean, Date, Datetime, JSON, UUID. */
  scalar: string;
}

export interface FilterFieldMeta {
  name: string;
  scalar: string;
  operators: string[];
}

/** Operators the API is configured to accept, in the order the UI offers them. */
export const OPERATOR_ORDER = [
  'equalTo',
  'notEqualTo',
  'greaterThan',
  'greaterThanOrEqualTo',
  'lessThan',
  'lessThanOrEqualTo',
  'isNull',
] as const;

export const OPERATOR_LABELS: Record<string, string> = {
  equalTo: 'equals',
  notEqualTo: 'not equal',
  greaterThan: 'greater than',
  greaterThanOrEqualTo: 'greater or equal',
  lessThan: 'less than',
  lessThanOrEqualTo: 'less or equal',
  isNull: 'is null',
};

const NUMERIC_SCALARS = new Set(['Int', 'Float', 'BigInt', 'BigFloat']);
const TEMPORAL_SCALARS = new Set(['Date', 'Datetime']);

export const isNumericScalar = (scalar: string): boolean => NUMERIC_SCALARS.has(scalar);
export const isTemporalScalar = (scalar: string): boolean => TEMPORAL_SCALARS.has(scalar);

/** Unwraps NON_NULL and LIST wrappers down to the named type. */
export function namedType(ref: TypeRef | null | undefined): string | null {
  let current = ref ?? null;
  while (current && !current.name && current.ofType) current = current.ofType;
  return current?.name ?? null;
}

function typeByName(
  schema: IntrospectionSchema,
  name: string | null | undefined
): IntrospectionType | undefined {
  return name ? schema.types.find((t) => t.name === name) : undefined;
}

export function listCollections(schema: IntrospectionSchema): Collection[] {
  const query = typeByName(schema, schema.queryType.name);
  const collections: Collection[] = [];

  for (const field of query?.fields ?? []) {
    const connection = typeByName(schema, namedType(field.type));
    const nodes = connection?.fields?.find((f) => f.name === 'nodes');
    const nodeType = namedType(nodes?.type);
    if (!connection || connection.kind !== 'OBJECT' || !nodeType) continue;

    const argType = (name: string) => namedType(field.args?.find((a) => a.name === name)?.type);
    collections.push({
      field: field.name,
      nodeType,
      filterType: argType('filter'),
      orderByType: argType('orderBy'),
    });
  }

  return collections.sort((a, b) => a.field.localeCompare(b.field));
}

export function nodeColumns(schema: IntrospectionSchema, nodeType: string): ColumnMeta[] {
  const columns: ColumnMeta[] = [];
  for (const field of typeByName(schema, nodeType)?.fields ?? []) {
    if (field.args?.length) continue;
    const scalar = namedType(field.type);
    const kind = typeByName(schema, scalar)?.kind;
    if (!scalar || (kind !== 'SCALAR' && kind !== 'ENUM')) continue;
    columns.push({ name: field.name, scalar });
  }
  return columns;
}

export function filterFields(
  schema: IntrospectionSchema,
  filterType: string | null
): FilterFieldMeta[] {
  const fields: FilterFieldMeta[] = [];
  for (const input of typeByName(schema, filterType)?.inputFields ?? []) {
    if (input.name === 'and' || input.name === 'or' || input.name === 'not') continue;
    const operatorType = typeByName(schema, namedType(input.type));
    const available = new Set((operatorType?.inputFields ?? []).map((f) => f.name));
    const operators = OPERATOR_ORDER.filter((op) => available.has(op));
    const equalTo = operatorType?.inputFields?.find((f) => f.name === 'equalTo');
    if (operators.length) {
      fields.push({ name: input.name, scalar: namedType(equalTo?.type) ?? 'String', operators });
    }
  }
  return fields;
}

export function orderByValues(schema: IntrospectionSchema, enumName: string | null): string[] {
  return (typeByName(schema, enumName)?.enumValues ?? []).map((v) => v.name);
}

/** `sequencingRunDate` -> `SEQUENCING_RUN_DATE`, the prefix PostGraphile uses in orderBy enums. */
export function sortPrefix(column: string): string {
  return column
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

const ACRONYMS: Record<string, string> = {
  id: 'ID',
  etag: 'ETag',
  s3: 'S3',
  url: 'URL',
  uri: 'URI',
  md5: 'MD5',
  ica: 'ICA',
};

/** `sequencingRunId` -> `Sequencing Run ID`. */
export function humanize(column: string): string {
  const whole = ACRONYMS[column.toLowerCase()];
  if (whole) return whole;
  return column
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Static catalogue of the OrcaVault mart tables.
 *
 * Grouping mirrors the dbt layout under orcavault/models/mart/<group>/<table>.sql.
 * Descriptions and status come from seeds/dictionary/dictionary__data_mart_catalog.csv.
 * `collection` is the PostGraphile root field (`all<PluralPascalCase>`), which is how a
 * dbt table name in the URL is matched to the live GraphQL schema.
 *
 * The live schema stays the source of truth for what exists: entries missing from the
 * API are shown as unavailable, and collections missing from this file are listed under
 * the "other" group so nothing the API exposes is hidden.
 */
export type GroupId =
  'centre' | 'curation' | 'dawson' | 'error' | 'external' | 'grimmond' | 'tothill' | 'other';

export interface Group {
  id: GroupId;
  label: string;
  blurb: string;
}

export const GROUPS: Group[] = [
  { id: 'centre', label: 'Centre', blurb: 'Centre-wide sequencing, file and workflow marts' },
  { id: 'curation', label: 'Curation', blurb: 'Curation team LIMS view' },
  { id: 'dawson', label: 'Dawson', blurb: 'Dawson research group' },
  { id: 'error', label: 'Error reports', blurb: 'Cross-service consistency checks' },
  { id: 'external', label: 'External', blurb: 'Externally sequenced libraries' },
  { id: 'grimmond', label: 'Grimmond', blurb: 'Grimmond research group' },
  { id: 'tothill', label: 'Tothill', blurb: 'Tothill research group' },
  { id: 'other', label: 'Other', blurb: 'Exposed by the API but not catalogued here yet' },
];

export type TableStatus = 'STABLE' | 'DEMO';

export interface CatalogEntry {
  /** dbt model name; also the URL segment. */
  table: string;
  group: GroupId;
  /** PostGraphile root query field. */
  collection: string;
  description: string;
  status: TableStatus;
  /** Preferred orderBy enum value when the URL carries no sort. */
  defaultSort?: string;
}

const CENTRE = 'Listing of the Centre genomic sequencing';

export const CATALOG: CatalogEntry[] = [
  // centre
  {
    table: 'lims',
    group: 'centre',
    collection: 'allLims',
    description: `${CENTRE} LIMS metadata in flat table model`,
    status: 'STABLE',
    defaultSort: 'SEQUENCING_RUN_DATE_DESC',
  },
  {
    table: 'fastq',
    group: 'centre',
    collection: 'allFastqs',
    description: `${CENTRE} unaligned read level file FASTQ S3 locations in flat table model`,
    status: 'STABLE',
    defaultSort: 'SEQUENCING_RUN_DATE_DESC',
  },
  {
    table: 'fastq_history',
    group: 'centre',
    collection: 'allFastqHistories',
    description: `${CENTRE} unaligned read level file FASTQ S3 historical locations`,
    status: 'STABLE',
  },
  {
    table: 'bam',
    group: 'centre',
    collection: 'allBams',
    description: `${CENTRE} aligned read level file BAM and BAI S3 locations in flat table model`,
    status: 'STABLE',
    defaultSort: 'LAST_MODIFIED_DATE_DESC',
  },
  {
    table: 'vcf',
    group: 'centre',
    collection: 'allVcfs',
    description: `${CENTRE} variant call file VCF and VCF.TBI S3 locations in flat table model`,
    status: 'DEMO',
  },
  {
    table: 'workflow',
    group: 'centre',
    collection: 'allWorkflows',
    description: `${CENTRE} analysis workflow run details in flat table model`,
    status: 'STABLE',
    defaultSort: 'WORKFLOW_END_DESC',
  },
  {
    table: 'workflow_cost',
    group: 'centre',
    collection: 'allWorkflowCosts',
    description: `${CENTRE} analysis workflow run costs in flat table model`,
    status: 'DEMO',
  },
  {
    table: 'workflow_cost_report',
    group: 'centre',
    collection: 'allWorkflowCostReports',
    description: `${CENTRE} analysis workflow run costs, based on the ICA usage report`,
    status: 'DEMO',
  },
  {
    table: 'output',
    group: 'centre',
    collection: 'allOutputs',
    description: `${CENTRE} analysis workflow run output location in flat table model`,
    status: 'STABLE',
  },
  {
    table: 'accreditation_lims',
    group: 'centre',
    collection: 'allAccreditationLims',
    description: `${CENTRE} Accreditation LIMS metadata in flat table model`,
    status: 'STABLE',
  },
  {
    table: 'variant_monitoring_result',
    group: 'centre',
    collection: 'allVariantMonitoringResults',
    description: `${CENTRE} variant monitoring results per workflow run and library`,
    status: 'DEMO',
  },
  {
    table: 'catalog',
    group: 'centre',
    collection: 'allCatalogs',
    description: 'Data mart table catalog',
    status: 'STABLE',
  },
  // curation
  {
    table: 'curation_lims',
    group: 'curation',
    collection: 'allCurationLims',
    description: 'Listing of the Centre Curation Team LIMS metadata in flat table model',
    status: 'DEMO',
  },
  // dawson
  {
    table: 'dawson_lims',
    group: 'dawson',
    collection: 'allDawsonLims',
    description: 'Listing of Dawson Research Group LIMS metadata in flat table model',
    status: 'DEMO',
  },
  {
    table: 'dawson_fastq',
    group: 'dawson',
    collection: 'allDawsonFastqs',
    description: 'Listing of Dawson Research Group primary read level FASTQ S3 locations',
    status: 'DEMO',
  },
  // error
  {
    table: 'em_library_services',
    group: 'error',
    collection: 'allEmLibraryServices',
    description: 'Listing of the Centre sequenced library availability in OrcaBus services',
    status: 'STABLE',
  },
  {
    table: 'em_library_aliases',
    group: 'error',
    collection: 'allEmLibraryAliases',
    description:
      'Listing of the Centre sequenced library aliases with run comments by the lab team',
    status: 'STABLE',
  },
  {
    table: 'em_library_dns',
    group: 'error',
    collection: 'allEmLibraryDns',
    description: 'Listing of the Centre do-not-sequence (DNS) libraries with lab team run comments',
    status: 'STABLE',
  },
  // external
  {
    table: 'external_lims',
    group: 'external',
    collection: 'allExternalLims',
    description: 'Listing of the externally sequenced LIMS metadata in flat table model',
    status: 'STABLE',
  },
  // grimmond
  {
    table: 'grimmond_lims',
    group: 'grimmond',
    collection: 'allGrimmondLims',
    description: 'Listing of Grimmond Research Group LIMS metadata in flat table model',
    status: 'DEMO',
  },
  // tothill
  {
    table: 'tothill_lims',
    group: 'tothill',
    collection: 'allTothillLims',
    description: 'Listing of Tothill Research Group LIMS metadata in flat table model',
    status: 'DEMO',
  },
  {
    table: 'tothill_fastq',
    group: 'tothill',
    collection: 'allTothillFastqs',
    description: 'Listing of Tothill Research Group primary read level FASTQ S3 locations',
    status: 'DEMO',
  },
];

export interface ResolvedTable extends CatalogEntry {
  /** true/false once the live schema is known; undefined while it is still loading. */
  available?: boolean;
}

/** In-app link to a table view. The app is one static page, so the table is a query parameter. */
export const tableHref = (table: string) => `/?table=${encodeURIComponent(table)}`;

export function groupById(id: string): Group | undefined {
  return GROUPS.find((g) => g.id === id);
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Matches a catalogue entry to a live root field, tolerating a differently pluralised name. */
function matchesCollection(entry: CatalogEntry, field: string): boolean {
  if (entry.collection === field) return true;
  const expected = `all${normalise(entry.table)}`;
  const actual = normalise(field);
  return actual === expected || actual === `${expected}s` || actual === `${expected}es`;
}

/**
 * Merges the static catalogue with the collections found in the live schema.
 * Pass `null` while the schema is still loading to keep every entry navigable.
 */
export function resolveCatalog(live: { field: string }[] | null): ResolvedTable[] {
  if (!live) return CATALOG.map((entry) => ({ ...entry }));
  const liveCollections = live.map((c) => c.field);

  const claimed = new Set<string>();
  const known = CATALOG.map<ResolvedTable>((entry) => {
    const field = liveCollections.find((f) => matchesCollection(entry, f));
    if (field) claimed.add(field);
    return { ...entry, collection: field ?? entry.collection, available: Boolean(field) };
  });

  const extras = liveCollections
    .filter((field) => !claimed.has(field))
    .map<ResolvedTable>((field) => ({
      table: field,
      group: 'other',
      collection: field,
      description: 'Exposed by the API but not catalogued in this UI yet.',
      status: 'DEMO',
      available: true,
    }));

  return [...known, ...extras];
}

# OrcaVault Project Description

## Purpose of this document

This document is an onboarding and project-context guide for both people and AI agents working in this repository.

It explains:

- What OrcaVault is intended to do.
- What the current repository implements today.
- How data moves through the project.
- What each major folder and domain module means.
- How the current project differs from the legacy OrcaVault.
- Which parts of the legacy warehouse have and have not been migrated.
- Which conventions and cautions should be preserved when changing the project.

The current source code is authoritative when this document, the OrcaHouse documentation, and the legacy repository disagree.

## Executive summary

OrcaVault is the enterprise data warehouse for the upstream OrcaBus platform.

OrcaBus uses an event-driven microservice architecture. Operational metadata is spread across independently evolving services such as:

- Metadata Manager
- Sequence Run Manager
- Workflow Manager
- File Manager

OrcaVault consolidates those sources into a historically traceable data model. Its core responsibilities are:

1. Capture business identities such as libraries, samples, subjects, projects, sequencing runs, workflow runs, and S3 objects.
2. Connect those identities through stable business relationships.
3. Preserve descriptive changes, operational states, comments, deletes, and source provenance.
4. Import historical records from the legacy Data Portal and laboratory spreadsheets.
5. Provide a stable foundation for audit, business intelligence, reporting, federated queries, and future data marts.

The current repository is a standalone dbt project targeting Amazon Redshift Serverless. It is rebuilding the foundational Raw Vault portion of the previous OrcaVault warehouse.

It is important to understand that the migration is not complete:

> The current repository implements staging, persistent spreadsheet staging, and a domain-oriented Raw Vault. It does not yet implement the legacy Business Vault/current-state logic or consumer-facing data marts.

## Quick context for AI agents

When working in this repository, use the following mental model:

- This is a SQL/dbt data warehouse project, not an application service.
- It assumes upstream tables already exist. dbt `source()` declarations point to those tables; they do not ingest the data.
- The current warehouse engine is Redshift, even when old documentation discusses PostgreSQL, Aurora, FDW, or local Docker development.
- The active data path uses CDC tables exposed through `awsdatacatalog`.
- Legacy Data Portal data is a controlled, one-time backfill path enabled with the `load_legacy` dbt variable.
- `models/dcl/raw_vault` is intentionally source-faithful. It preserves history rather than resolving the latest business state.
- Code comments that say “Business Vault handles…” describe a future/downstream layer that is not present in this repository yet.
- Do not assume that a model present in the legacy project has already been migrated.
- Do not port PostgreSQL-specific indexes, JSON operations, hash syntax, or macros directly into Redshift models without adapting them.
- Preserve business-key hashing, data contracts, source attribution, incremental behavior, and historical load semantics when editing models.

## Related projects and documentation

### Current project

- Repository: `umccr/orcavault`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcavault`
- Scope: standalone Redshift/dbt rebuild of OrcaVault

### OrcaHouse documentation

- Repository: `umccr/orcahouse-doc`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcahouse-doc`
- Scope: high-level warehouse architecture, glossary, ERDs, generated dbt documentation, and Athena examples

The documentation remains useful for concepts and for understanding the former end-to-end warehouse. However, its ERDs and generated dbt documentation primarily describe the legacy implementation and may lag current development.

### Legacy OrcaVault

- Repository: `umccr/orcahouse`
- Project subdirectory: `orcavault`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcahouse/orcavault`
- Scope: former PostgreSQL-based implementation containing staging, Data Vault, current-state logic, and data marts

## Business problem

Transactional microservice databases are optimized for operating individual services, not for cross-service reporting or long-term historical analysis.

Without a warehouse:

- A library may have different identifiers or attributes in different services.
- Relationships between a library, sample, project, sequencing run, and workflow run must be reconstructed repeatedly.
- A service update can overwrite the previous business state.
- Replaced services can make historical records difficult to query.
- Legacy Data Portal records and spreadsheets remain isolated from current OrcaBus data.
- Auditing when and where a value changed is difficult.

OrcaVault addresses this by separating stable business identities, relationships, and changing attributes, while recording when each fact was loaded and where it came from.

## Architectural model

The intended warehouse flow is:

```text
Operational sources and files
        |
        +-- OrcaBus CDC tables in AWS Glue Data Catalog
        +-- transient spreadsheet tables
        +-- legacy Data Portal tables
        |
        v
Transient Staging Area (TSA)
        |
        v
Persistent Staging Area (PSA)
        |
        v
Data Consolidation Layer (DCL)
        |
        +-- Raw Vault          <- implemented in this repository
        +-- Business Vault     <- not yet implemented here
        |
        v
Information Delivery / Marts  <- not yet implemented here
        |
        v
Athena, APIs, reporting, BI, and audit users
```

The current implemented flow is more specifically:

```text
TSA spreadsheets ----------------> PSA cleaned history -----------+
                                                                  |
OrcaBus catalogued CDC tables ------------------------------------+--> DCL Raw Vault
                                                                  |      |- Hubs
Legacy Data Portal -- load_legacy one-time backfill --------------+      |- Links
                                                                         `- Satellites
```

## Warehouse terminology

| Term                  | Meaning in this project                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ODS                   | Operational Data Store. Read-only operational source tables. Present in the legacy design, but not as a current model folder.  |
| TSA                   | Transient Staging Area. Temporary landing tables, currently used for spreadsheet data.                                         |
| PSA                   | Persistent Staging Area. Cleaned, append-only preservation of staged source records.                                           |
| DCL                   | Data Consolidation Layer. The Data Vault portion of the warehouse.                                                             |
| Raw Vault             | Source-faithful identities, relationships, and historical descriptive records.                                                 |
| Business Vault        | Derived business rules, current-state calculations, aliases, effectivity, and other interpretations. Not implemented here yet. |
| Hub                   | A unique business identity and business key.                                                                                   |
| Link                  | A relationship between two or more Hub identities.                                                                             |
| Satellite             | Descriptive attributes or events that change over time.                                                                        |
| Effectivity Satellite | A derived validity window for a changing relationship. Present only in the legacy project today.                               |
| Same-As Link          | A relationship between alternative identifiers for the same business object. Present only in the legacy project today.         |
| Mart                  | A denormalized, consumer-oriented table for reporting or a specific business use case.                                         |
| CDC                   | Change Data Capture. Source changes represented as insert/update/delete events.                                                |
| LDTS                  | Load date/timestamp, represented by `load_datetime`.                                                                           |
| RSRC                  | Record source, represented by `record_source`.                                                                                 |

## Repository structure

```text
orcavault/
|- models/
|  |- tsa/
|  |  `- sources.yml
|  |- psa/
|  |  |- spreadsheet__google_lims.sql
|  |  |- spreadsheet__ica_usage_report.sql
|  |  |- spreadsheet__library_tracking_metadata.sql
|  |  `- schema.yml
|  |- cdc/
|  |  `- sources.yml
|  |- legacy/
|  |  `- sources.yml
|  `- dcl/
|     `- raw_vault/
|        |- library/
|        |- sample/
|        |- subject/
|        |- project/
|        |- sequencing/
|        |- workflow/
|        `- s3object/
|- macros/
|  |- generate_hash_diff.sql
|  `- generate_schema_name.sql
|- seeds/
|  `- mdm/
|- analyses/
|- snapshots/
|- tests/
|- dbt_project.yml
|- profiles.yml
|- packages.yml
|- requirements.txt
|- Makefile
|- dx.sh
|- mask_docs.py
|- README.md
`- README_DEV.md
```

### Root configuration

`dbt_project.yml`

- Defines the dbt project and standard resource paths.
- Materializes PSA models in the `psa` schema.
- Materializes DCL models in the `dcl` schema.
- Places seeds in the `seed` schema.
- Does not currently define a `mart` model layer.

`profiles.yml`

- Defines an IAM-authenticated Redshift connection.
- Uses port `5439` and database `orcavault`.
- Expects the host and user to be provided through environment variables.
- Is configured for the remote AWS development environment rather than a local PostgreSQL database.

`dx.sh`

- Resolves the Redshift Serverless endpoint.
- Obtains the management host key.
- Provides SSH/SSM port-forwarding helpers.
- Exports dbt connection environment variables.

`Makefile`

- Installs and runs developer checks.
- Supports secret scanning.
- Generates and serves dbt documentation.
- Runs dbt dependency installation and tests.
- Does not create a local warehouse stack like the legacy Makefile did.

### Standard dbt directories

`models/`

- Contains SQL transformations and upstream source declarations.
- A `.sql` model normally becomes a database relation with the same name.
- `ref('model_name')` creates a dependency on another dbt model.
- `source('source_name', 'table_name')` refers to an existing upstream table.

`macros/`

- Contains reusable Jinja/SQL functions.
- `generate_hash_diff.sql` produces a null-safe SHA-256 hash across satellite attributes.
- `generate_schema_name.sql` prevents dbt from prefixing custom schema names.

`seeds/`

- Contains small CSV-managed reference data.
- `mdm__workflow_run.csv` currently records equivalent or aliased workflow run identifiers.

`analyses/`, `snapshots/`, and `tests/`

- Are standard dbt locations.
- They are currently placeholders and do not contain substantive project logic.

## Source and staging modules

### `models/tsa`

TSA declares existing transient spreadsheet tables in the `orcavault.tsa` schema:

- `spreadsheet__google_lims`
- `spreadsheet__ica_usage_report`
- `spreadsheet__library_tracking_metadata`

These tables are expected to have been loaded by infrastructure or jobs outside this dbt repository.

### `models/psa`

The PSA models:

- Normalize spreadsheet text and line breaks.
- Filter entirely empty records.
- Preserve previously unseen spreadsheet states.
- Add `load_datetime`.
- Add `record_source`.
- Use incremental append semantics.

PSA allows edits to mutable spreadsheets to become durable warehouse history.

The three current PSA models preserve different source identities:

- `spreadsheet__google_lims` stores cleaned Google LIMS rows and uses the
  source timestamp as its incremental watermark.
- `spreadsheet__library_tracking_metadata` appends spreadsheet states that
  have not already been persisted.
- `spreadsheet__ica_usage_report` stores all 33 fields produced by the
  OrcaGlue ICA usage report job. It types monetary, quantity, date, and
  reference-match fields; labels each load; and uses the legacy-compatible
  SHA-256 hash of cleaned `usage_id + billing_date` as its incremental
  identity.

The ICA model intentionally checks new hashes only against the existing PSA
table. Duplicate rows sharing a previously unseen hash within one TSA snapshot
are therefore retained for audit compatibility, while later snapshots with an
already-persisted hash are not appended. Corrections that reuse the same
`usage_id` and `billing_date` are outside this model's history contract.

The upstream `spreadsheet__ica_usage_report` TSA table is owned and loaded by
the separate OrcaGlue project. That table must be deployed and populated before
this dbt model can run. The old `csv__ica_usage_report` table and downstream
workflow-cost models remain part of a separate migration.

### `models/cdc`

This source module declares tables in `awsdatacatalog` for:

- `orcabus_sequence_run_manager`
- `orcabus_workflow_manager`
- `orcabus_metadata_manager`
- `orcabus_filemanager`

The models commonly consume:

- `op`, representing the CDC operation.
- `_dms_cdc_timestamp`, representing the source change timestamp.

The source YAML exposes more upstream tables than are currently consumed by Raw Vault models. Source declaration does not imply migration completeness.

### `models/legacy`

This source module declares historical Data Portal tables in the `data_portal` catalog schema.

Legacy records are normally excluded from daily execution. Relevant models enable them with:

```bash
dbt run --vars '{"load_legacy": true}'
```

Legacy-only satellites compile to a zero-row, correctly typed query during ordinary daily runs.

## Data Vault conventions

### Hubs

Hubs store:

- A SHA-256 hash key such as `library_hk`.
- The human/business key such as `library_id`.
- `load_datetime`.
- `record_source`.
- `last_seen_datetime`.

Current Hubs use Redshift incremental `merge` behavior. Existing identities retain their original load/source information while `last_seen_datetime` is updated.

### Links

Links store:

- A hash representing the complete relationship.
- The hash keys of the connected Hubs.
- `load_datetime`.
- `record_source`.

Current Links use incremental append behavior. They preserve relationships seen across spreadsheets, legacy data, and active OrcaBus sources.

### Satellites

Satellites store:

- The parent Hub or Link hash.
- `load_datetime`.
- `record_source`.
- `hash_diff`.
- Source-specific descriptive attributes or events.

Active CDC satellites also retain `op` and `_dms_cdc_timestamp`.

They intentionally preserve raw history. A delete event is recorded rather than automatically removing the previous row.

### Contracts and tests

Every current Raw Vault model has a domain-local YAML definition that provides some combination of:

- Enforced column data types.
- Primary-key expectations.
- Uniqueness tests.
- Not-null tests.
- Hub/Link relationship tests.
- Unique combinations of parent keys.

Changes to a SQL model and its YAML contract should be made together.

## Raw Vault domain modules

The current DCL contains 41 SQL models:

- 11 Hubs
- 12 Links
- 18 Satellites

### Library domain

Primary identities:

- `hub_library`
- `hub_experiment`

Relationships:

- Library to experiment
- Library to internal sample
- Library to external sample
- Library to internal subject
- Library to external subject
- Library to project
- Library to owner
- Library to sequencing run
- Library to workflow run

Source-specific descriptive satellites:

| Satellite           | Source                                   |
| ------------------- | ---------------------------------------- |
| `sat_library_glab`  | Library tracking metadata spreadsheet    |
| `sat_library_glims` | Google LIMS spreadsheet, legacy backfill |
| `sat_library_plab`  | Legacy Data Portal lab metadata          |
| `sat_library_plims` | Legacy Data Portal LIMS row              |
| `sat_library_mm`    | Active OrcaBus Metadata Manager CDC      |

The Library domain is the centre of the warehouse relationship graph.

### Sample domain

Models:

- `hub_sample`
- `hub_external_sample`
- `link_internal_to_external_sample`

This domain distinguishes the internal warehouse/laboratory sample identifier from an externally supplied sample identifier and records their mapping.

No active sample attribute satellite has been implemented yet.

### Subject domain

Models:

- `hub_internal_subject`
- `hub_external_subject`
- `link_internal_to_external_subject`
- `sat_internal_subject_mm`
- `sat_external_subject_mm`

The internal subject is sourced from the Metadata Manager individual identity. The external subject is sourced from the Metadata Manager subject identity.

### Project domain

Models:

- `hub_project`
- `hub_owner`
- `link_project_ownership`
- `sat_project_mm`
- `sat_owner_mm`

This domain records projects, their descriptive attributes, contacts/owners, and project ownership.

### Sequencing domain

Models:

- `hub_sequencing_run`
- `sat_sequencing_run_detail`
- `sat_sequencing_run_state`
- `sat_sequencing_run_comment`
- `sat_sequencing_run_portal_legacy`
- `sat_sequencing_run_portal_legacy_history`

The Hub business key is the instrument/sequencing run identifier.

The active satellites preserve:

- Run metadata.
- Every sequence-run state event.
- Comments and comment deletion state.
- CDC operation and timestamp.

The legacy satellites preserve both the former Data Portal sequence representation and its historical sequencing-run representation.

### Workflow domain

Models:

- `hub_workflow_run`
- `sat_workflow_run_detail`
- `sat_workflow_run_state`
- `sat_workflow_run_comment`
- `sat_workflow_run_portal_legacy`

The Hub business key is `portal_run_id`.

The active satellites keep workflow definition/run attributes, each state transition, and comments as separate source-faithful histories. A future Business Vault should derive fields such as:

- Current workflow status.
- Start and completion times.
- Latest comment.
- Canonical workflow run where aliases exist.

### S3 object domain

Models:

- `hub_s3object`

The business key is the full S3 location derived from bucket and key.

This is the highest-volume Hub. Its model documents a special initial-load sequence:

1. Run the active File Manager CDC load first.
2. Run the legacy load second with `load_legacy: true`.

The current project does not yet include the former S3 object history, version/current-state, delete-state, library/run parsing, or file-format derivations.

## Incremental loading behavior

Incremental identity is source-specific:

- Google LIMS uses its source timestamp as a watermark.
- Library tracking metadata compares complete cleaned spreadsheet states.
- ICA usage compares the cleaned `(usage_id, billing_date)` hash with persisted PSA history.
- Active CDC models commonly compare `_dms_cdc_timestamp` with the maximum warehouse `load_datetime`.

The principal patterns are:

- Hubs: incremental `merge`, keyed by Hub hash, updating `last_seen_datetime`.
- Links: incremental `append`, with existing relationship hashes excluded.
- Satellites: incremental `append`, with existing `hash_diff` values excluded.
- Frozen legacy satellites: one-time load followed by a daily no-op.

Do not use `--full-refresh` casually. Recreating an incremental model changes or destroys the warehouse load-history semantics represented by `load_datetime`.

## Current project versus legacy project

| Area                      | Current standalone OrcaVault                                   | Legacy OrcaVault                                   |
| ------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| Repository shape          | Independent repository                                         | Subdirectory of the OrcaHouse monorepo             |
| Warehouse engine          | Amazon Redshift Serverless                                     | PostgreSQL/Aurora-oriented                         |
| dbt adapter               | `dbt-redshift`                                                 | `dbt-postgres`                                     |
| Development model         | Remote AWS warehouse through IAM/tunnel                        | Local PostgreSQL stack plus production target      |
| Operational source access | CDC tables through `awsdatacatalog`                            | ODS schema, historically mounted through FDW       |
| Legacy source access      | Explicit one-time backfill                                     | Always combined with active sources                |
| DCL organization          | Domain-oriented `raw_vault/<domain>`                           | Flat `models/dcl` directory                        |
| Physical optimization     | Redshift distribution and sort keys                            | PostgreSQL B-tree and GIN indexes                  |
| Hash implementation       | Redshift `sha2()`                                              | PostgreSQL `encode(sha256(...), 'hex')`            |
| Model contracts           | Enforced, domain-local YAML                                    | Centralized schema YAML without enforced contracts |
| Raw CDC operations        | Retained in active satellites                                  | Mostly read from current/historical ODS tables     |
| Effectivity               | Not yet migrated                                               | Seven `effsat_*` models                            |
| Alias resolution          | Mapping seed exists; SAL models absent                         | `sal_library` and `sal_workflow_run`               |
| S3 history/intelligence   | Hub only                                                       | Full history/current state and key parsing         |
| Costs and variants        | ICA usage PSA only; downstream costs and variants not migrated | ICA costs/usage and variant-monitoring models      |
| Consumer marts            | None                                                           | 21 centre/team/error marts                         |

### Model-count comparison

Current repository:

- 44 SQL models total
- 3 PSA models
- 41 Raw Vault DCL models
- 0 marts

Legacy project:

- 83 SQL models total
- 3 PSA models
- 59 DCL models
- 21 marts

The legacy DCL includes:

- 11 Hubs
- 12 Links
- 27 Satellites
- 7 Effectivity Satellites
- 2 Same-As Links

## What has been preserved or improved

The migration preserves the foundational business-key network:

- The same major Hub identities exist.
- The same 12 core Link relationships exist.
- The primary library metadata satellites remain.
- Project, subject, workflow, sequencing-run, and S3 identities remain recognizable.

The new design improves:

- Separation between one-time legacy loads and active daily sources.
- Explicit source priority and `record_source`.
- Preservation of CDC operation and source timestamps.
- Domain-oriented organization.
- Redshift-specific physical design.
- Reusable hash-diff generation.
- Enforced model contracts.
- Model-local uniqueness, not-null, and relationship testing.
- Separation of workflow/sequence state, comment, and detail histories.

## What has not yet been migrated

### Business Vault/current-state logic

Missing legacy capabilities include:

- Relationship effectivity windows.
- `effective_from`, `effective_to`, and `is_current`.
- Same-As Link resolution for library aliases.
- Same-As Link resolution for workflow-run aliases.
- A consolidated current workflow-run satellite.

### File Manager and S3 intelligence

Missing models include:

- S3 event history.
- Current S3 version/state.
- Delete and accessibility state.
- S3-to-library parsing.
- S3-to-sequencing/workflow-run parsing.
- FASTQ, BAM, output, and filename/extension interpretation.

### Sequence and workflow enrichments

Missing capabilities include:

- Sequence-run samplesheet content/history.
- Library-to-sequencing-run relationship attributes.
- Workflow payload history as previously modeled.
- ICA workflow cost satellites, business rules, and reporting models beyond the usage PSA.
- Variant-monitoring result history.

### Information Delivery / marts

The following legacy business outputs are not present:

- Centre LIMS
- FASTQ and FASTQ history
- BAM
- Workflow
- Workflow cost and cost report
- Output locations
- Variant monitoring
- Accreditation LIMS
- Data mart catalog
- Curation LIMS
- Dawson, Grimmond, and Tothill views
- External LIMS
- Library alias, data-not-specified, and cross-service error reports

Any user or API that currently depends on a legacy `mart.*` table cannot be switched to this repository without first implementing the required Business Vault and mart dependencies.

## Working safely in this repository

### Before changing a model

1. Identify whether the model is a Hub, Link, or Satellite.
2. Identify every source system that owns the business key or relationship.
3. Check both the active CDC and optional legacy branches.
4. Check whether the model has a one-time/no-op legacy pattern.
5. Inspect the matching `_hub.yml`, `_link.yml`, or `_sat.yml`.
6. Confirm Redshift-compatible types and SQL.
7. Preserve existing hash input ordering.
8. Preserve `record_source`, `load_datetime`, and CDC metadata unless a migration explicitly changes their semantics.

### When adding a source

Consider whether it requires:

- A new `source()` declaration.
- An existing or new PSA model.
- A new Hub business key.
- A new Link relationship.
- A source-specific Satellite.
- A source-priority rule during initial migration.
- New model contracts and relationship tests.
- A one-time legacy branch versus an active daily branch.

### When porting a legacy model

Do not copy it mechanically. Review:

- PostgreSQL `encode`, `bytea`, regex, array, JSONB, filtered aggregate, and index syntax.
- B-tree/GIN indexes, which should not be carried into Redshift.
- Appropriate Redshift distribution and sort keys.
- Whether the model is actually Raw Vault, Business Vault, or a mart.
- Whether legacy ODS sources now map to CDC catalog tables.
- Whether current CDC events require deduplication by `_dms_cdc_timestamp`.
- Whether deletes and out-of-order events need explicit handling.
- Whether the output should use an enforced dbt model contract.

### Validation expectations

At minimum, a model change should be checked with the relevant available dbt operations:

```bash
dbt deps
dbt compile
dbt test
dbt run -s <model_name>
```

Development requires an authenticated AWS session and a connection to the remote Redshift development environment. Consult `README.md`, `README_DEV.md`, and `dx.sh` before attempting connected runs.

## Source-of-truth order

When information conflicts, use this order:

1. Current SQL models and YAML contracts in this repository.
2. Current `dbt_project.yml`, `profiles.yml`, and development scripts.
3. Current git history and accepted migration decisions.
4. This `project-description.md`.
5. OrcaHouse high-level architecture and glossary.
6. Legacy OrcaVault source code for behavior that has not yet been migrated.
7. Generated dbt documentation and manually maintained ERDs, which may lag.

## Current-state conclusion

OrcaVault remains the warehouse responsible for making fragmented OrcaBus and legacy genomic metadata historically understandable and queryable.

The current repository is a cleaner Redshift-native foundation:

- It has the core business identities.
- It has the core relationship network.
- It preserves active CDC and legacy history.
- It is more explicit about source provenance, contracts, and migration behavior.

However, it is currently the beginning and middle of the warehouse pipeline, not the completed information-delivery system. Business Vault derivations, file intelligence, cost/variant enrichments, and marts remain the principal migration work needed for functional parity with the legacy OrcaVault.

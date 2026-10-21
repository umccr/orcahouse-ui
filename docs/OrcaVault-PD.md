# OrcaVault Project Description

## Purpose of this document

This document is an onboarding and project-context guide for people and AI agents who work on OrcaVault or on systems that consume it.

It lives in the `umccr/orcahouse-ui` repository (`docs/OrcaVault-PD.md`) as background for UI work. It describes OrcaVault itself, whose code lives in two other repositories:

- `umccr/orcavault`: the current Redshift/dbt rebuild. In this document, "the current project" means this repository.
- `umccr/orcahouse`: the legacy PostgreSQL dbt project (`orcavault/`), the warehouse infrastructure for both generations (`infra/`), and the mart GraphQL API (`infra/api`).

It explains:

- What OrcaVault is for, what is in and out of scope, and who uses it.
- What the current project implements today and how data moves through it.
- What each major folder and domain module means.
- How the current project differs from the legacy OrcaVault, and which parts have and have not been migrated.
- How consumers reach the data today and where the platform is heading.
- Which conventions and cautions to preserve when changing the project.
- Which questions are still open.

Infrastructure detail (accounts, networks, resource names, schedules, IAM, secrets) is in the internal Data Warehouse Architecture document (`docs/Data-Warehouse-Architecture.md`), kept beside a local `umccr/orcahouse` checkout and not committed to the repository. This document only summarises it.

This revision was checked on 2026-10-20 against `umccr/orcavault` at commit `27cde93`, `umccr/orcahouse` at commit `008332e`, and, read-only, the resources in the warehouse account `115253169271`. The source code is authoritative when this document, the OrcaHouse documentation, and either repository disagree (see [Source-of-truth order](#source-of-truth-order)).

## Executive summary

OrcaVault is the first Enterprise Data Warehouse (EDW) of the OrcaHouse project. It serves the upstream OrcaBus platform.

OrcaBus uses an event-driven microservice architecture. Operational metadata is spread across independently evolving services such as:

- Metadata Manager
- Sequence Run Manager
- Workflow Manager
- File Manager

Other OrcaBus services, such as the FASTQ Manager and Variant Monitoring, currently reach only the legacy warehouse, and only as events.

OrcaVault consolidates those sources into a historically traceable data model. Its core responsibilities are:

1. Capture business identities such as libraries, samples, subjects, projects, sequencing runs, workflow runs, and S3 objects.
2. Connect those identities through stable business relationships.
3. Preserve descriptive changes, operational states, comments, deletes, and source provenance.
4. Import historical records from the legacy Data Portal and laboratory spreadsheets.
5. Provide a stable foundation for audit, business intelligence (BI), reporting, federated queries, and data marts.

Two implementations exist side by side:

|             | Legacy OrcaVault                                                                  | Current OrcaVault                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Code        | `umccr/orcahouse`, folder `orcavault/`                                            | `umccr/orcavault`                                                                                                                             |
| Engine      | Aurora PostgreSQL cluster `orcahouse-db`, database `orcavault`                    | Redshift Serverless workgroups `orcahouse-dev` and `orcahouse-prod`, database `orcavault`                                                     |
| AWS account | UMCCR prod, `472057503814`                                                        | UniMelb data warehouse, `115253169271`                                                                                                        |
| Runtime     | ECS Fargate task, daily at 13:40 UTC                                              | Step Functions and ECS Fargate run `dbt build` daily at 03:00 Australia/Melbourne, in dev and prod (`umccr/orcahouse`, `infra/orcavault-run`) |
| Consumers   | OrcaHouse UI, mart GraphQL API (`mart.prod.umccr.org`), Athena `orcavault.mart.*` | Not yet consumed by the UI, the mart API, or Athena users                                                                                     |

The legacy project's README, and the READMEs of its runtime stacks (`infra/ecs/legacy/orcavault-dbt`, `infra/glue-job/legacy`), mark it as deprecated, but it is still the live serving path.

The current project is a standalone dbt project targeting Amazon Redshift Serverless. It rebuilds the previous OrcaVault warehouse in stages, and the migration is not complete:

> The current project implements CDC staging intermediates, persistent spreadsheet staging, a domain-oriented Raw Vault, part of the Business Vault, and seven Centre data marts, and builds them daily in dev and prod. It does not yet match the legacy marts, and its marts are not yet served to the OrcaHouse UI, the mart API, or Athena users, which all still read the legacy PostgreSQL warehouse.

The daily run started in dev on 2026-10-15 and in prod on 2026-10-19. As of 2026-10-20, every run has ended `failed` on two Library relationship tests (see [Run status](#run-status-2026-10-20)).

Direction (user-stated on 2026-10-06; not yet reflected in code): all OrcaHouse resources will move to the UniMelb warehouse account `115253169271`. Today that account runs all dev-environment processes and part of prod. No timeline is defined. See [Current state and direction](#current-state-and-direction).

## Scope and non-goals

In scope for OrcaVault:

- Modelling OrcaBus operational data, legacy Data Portal history, and laboratory spreadsheets into the PSA and DCL layers, using Data Vault 2.0 (DV2).
- Business Vault derivations: effectivity, alias resolution, current state, and computed attributes.
- Data marts (DM) in the `mart` schema for reporting and consumer use cases.

Out of scope for the dbt projects (owned elsewhere):

- Moving data into the warehouse. dbt `source()` declarations point at tables that other systems load: AWS DMS and Glue crawlers (`umccr/orcahouse`, `infra/`), the Glue TSA loaders (`umccr/orcaglue`; legacy `infra/glue-job/legacy/`), and the EventBridge ingest Lambdas (`infra/service-event-ingestion/`, legacy path only).
- Running the project. The daily run service (schedule, Step Functions state machine, ECS Fargate task, results bucket, and run event) is in `umccr/orcahouse` (`infra/orcavault-run`).
- Serving. The mart GraphQL API is in `umccr/orcahouse` (`infra/api`); the UI is `umccr/orcahouse-ui`.
- OncoVault. The warehouse account holds OncoVault buckets and Glue databases, but OncoVault is a separate EDW and its pipeline is not in these repositories.

## Stakeholders and consumers

The OrcaHouse data architecture (`orcahouse-doc`, `arch/`) names three user groups: business users, reporting users and developers, and data oversight.

The code shows these consumers today:

- OrcaHouse UI users at `https://portal.umccr.org/orcahouse/`. They sign in through the portal's Cognito user pool (Google) and query the mart GraphQL API.
- Athena users in the UMCCR prod account: the `orcahouse` workgroup with the `orcavault` data source over the legacy `mart` schema, and the Lake Formation resource links `mart` and `result`, which are granted to the `ProdOperator` and `ProdDataExplorer` SSO roles.
- Teams named by the legacy marts: the Centre (`lims`, `fastq`, `bam`, `workflow`, and others), the Curation team, the Dawson, Grimmond, and Tothill research groups, externally sequenced projects (`external_lims`), and the lab team (error marts with run comments).
- Warehouse developers, who work against Redshift `orcahouse-dev` through a tunnel or Redshift Query Editor v2.

Product and operational owners are not recorded in code (see [Open questions](#open-questions)). User stories and warehouse issues are tracked in `umccr/orcahouse-project`.

## Quick context for AI agents

When working on OrcaVault, use the following mental model:

- This is a SQL/dbt data warehouse project, not an application service.
- It assumes upstream tables already exist. dbt `source()` declarations point to those tables; they do not ingest the data.
- The current warehouse engine is Redshift. Documentation that discusses PostgreSQL, Aurora, FDW, or local Docker development describes the legacy project.
- The legacy PostgreSQL project is still what the UI, the mart API, and Athena read. A change to the current project does not change what consumers see today.
- The active data path uses OrcaBus CDC tables exposed through `awsdatacatalog` (Glue databases `orcabus_*`).
- Reads of those CDC tables are bounded by the watermark table `ops.cdc_watermark`, through the `cdc_bound`, `cdc_window`, and `cdc_upper_bound` macros. Models that read other warehouse models use `load_bound`. Never compare `_dms_cdc_timestamp` with `load_datetime`.
- The project runs `dbt build` daily in dev and prod through the run service in `umccr/orcahouse` (`infra/orcavault-run`). A change merged to `umccr/orcavault` reaches those runs only after the run service's `orcavault_release_ref` is moved to it.
- Legacy Data Portal data is a controlled, one-time backfill path enabled with the `load_legacy` dbt variable.
- `models/dcl/raw_vault` is intentionally source-faithful. It preserves history rather than resolving the latest business state.
- `models/dcl/business_vault` holds the derivations. Raw Vault comments that say "Business Vault handles…" refer to this layer. Some of the derivations they mention are not built yet; for example, no Business Vault satellite exists for sequencing runs.
- Do not assume that a model present in the legacy project has already been migrated.
- Do not port PostgreSQL-specific indexes, JSON operations, hash syntax, or macros directly into Redshift models without adapting them.
- Preserve business-key hashing, data contracts, source attribution, incremental behavior, and historical load semantics when editing models.

## Related projects and documentation

### Current project

- Repository: `umccr/orcavault`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcavault`
- Scope: standalone Redshift/dbt rebuild of OrcaVault
- Toolchain: dbt-core 1.11.12, dbt-redshift 1.10.2, dbt_utils 1.4.1

### Legacy OrcaVault and warehouse infrastructure

- Repository: `umccr/orcahouse`
- Project subdirectory: `orcavault`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcahouse/orcavault`
- Scope: former PostgreSQL implementation containing staging, Data Vault, current-state logic, and data marts. It is still the live serving path.
- The same repository holds the Terraform for both warehouse generations (`infra/`), the mart GraphQL API (`infra/api`), and the local PostgreSQL stack for the legacy project (`dev/`).

### OrcaVault run service

- Location: `umccr/orcahouse`, `infra/orcavault-run`
- Scope: runs the current project daily in dev and prod. An EventBridge Scheduler schedule starts the Step Functions state machine `orcavault-run-<env>`, which runs a Python runner and `dbt build` in an ECS Fargate task, stores the result in a results bucket, and sends an `OrcaVaultRunFinished` event to the default event bus. One image, built from a pinned `umccr/orcavault` ref, serves both environments.

### Warehouse notifications

- Location: `umccr/orcahouse`, `infra/notification`
- Scope: EventBridge rules in the warehouse account that send failures of OrcaGlue jobs, Glue crawlers, and DMS to the Slack channels `#alerts-dev` and `#alerts-prod`.

### OrcaGlue

- Repository: `umccr/orcaglue`
- Scope: Pulumi-deployed AWS Glue jobs that load the spreadsheet and ICA usage TSA tables in Redshift. Successor of the legacy `infra/glue-job/legacy/` jobs.

### OrcaHouse UI

- Repository: `umccr/orcahouse-ui` (where this document lives)
- Scope: static Next.js app that browses the marts through the mart GraphQL API.

### OrcaHouse documentation

- Repository: `umccr/orcahouse-doc`
- Local path used during this review: `/Users/rayliu/orcabus-work/orcahouse-doc`
- Scope: high-level warehouse architecture, glossary, ERDs, generated dbt documentation, and Athena examples

The documentation remains useful for concepts and for understanding the former end-to-end warehouse. However, its ERDs and generated dbt documentation describe the legacy implementation and lag current development. For example, the published dbt docs (generated on 2026-05-04) list 57 DCL, 20 mart, and 2 PSA models, while the legacy code has 59, 22, and 3. Its description of FDW mounts into the ODS schema is not implemented in any code in these repositories.

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

### Data layers

OrcaVault follows the OrcaHouse data layers defined in `orcahouse-doc` (`arch/` and `glossary.md`):

```text
Staging Area Layer
  ODS   OrcaBus CDC tables in the AWS Glue Data Catalog (awsdatacatalog.orcabus_*)
  TSA   transient spreadsheet and CSV tables (orcavault.tsa), loaded by OrcaGlue
  (legacy Data Portal tables in awsdatacatalog.data_portal: archived source, one-time backfill)
        |
        v
Enterprise Data Warehouse Layer
  PSA   persistent, cleaned history of TSA records (schema psa)
  DCL   Data Vault 2.0 (schema dcl)
          Raw Vault (RV)        <- implemented
          Business Vault (BV)   <- partly implemented
        |
        v
Information Delivery Layer
  DM    data marts (schema mart)  <- 7 Centre marts implemented
        |
        v
Athena, APIs, reporting, BI, and audit users  <- still served by the legacy warehouse
```

In the current project, the CDC tables play the ODS role. They do not pass through TSA or PSA; they feed the DCL directly through ephemeral `int_cdc_*` models.

### Current implemented flow

```text
TSA spreadsheets ---------------> PSA cleaned history -----------+
                                                                 |
OrcaBus CDC tables --> int_cdc_* (ephemeral) --------------------+--> DCL Raw Vault ------> DCL Business Vault ---------> mart (centre)
                                                                 |      |- Hubs               |- Effectivity Satellites
Legacy Data Portal -- load_legacy one-time backfill -------------+      |- Links              |- Same-As Links
                                                                        `- Satellites         `- Current-state and computed Satellites
```

Marts read from both the Raw Vault and the Business Vault.

### Platform summary

| Stage                      | Current project (warehouse account `115253169271`)                                                                                                                                                                                                                                                                                              | Legacy project (UMCCR accounts)                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OrcaBus operational data   | AWS DMS full load and CDC from the OrcaBus Aurora databases `workflow_manager`, `sequence_run_manager`, `metadata_manager`, and `filemanager` to the prod S3 landing zone as Parquet. The warehouse account reaches the OrcaBus database through an AWS PrivateLink endpoint service. Glue crawlers catalogue the files daily into `orcabus_*`. | `ods` schema in `orcahouse-db` (how it is populated is not defined in code; `orcahouse-doc` describes FDW), plus OrcaBus events written to `psa.event__*` tables by six EventBridge ingest Lambdas |
| Spreadsheets and ICA usage | OrcaGlue Glue jobs truncate and reload Redshift `orcavault.tsa.spreadsheet__*`                                                                                                                                                                                                                                                                  | Legacy Glue jobs (daily, 13:10 UTC) reload `orcahouse-db` `tsa.*`                                                                                                                                  |
| Transformation             | dbt-redshift against Redshift Serverless. The run service (`infra/orcavault-run`) runs `dbt build` daily at 03:00 Australia/Melbourne in each workgroup.                                                                                                                                                                                        | dbt-postgres on ECS Fargate, daily at 13:40 UTC (`infra/ecs/legacy/orcavault-dbt`)                                                                                                                 |
| Delivery                   | Marts stay in Redshift. Infrastructure exists to publish them as Parquet (`s3://orcavault-<env>-warehouse-…/v1/parquet/mart/`), crawl them into Glue `orcavault_<env>_mart`, and share them with the UMCCR prod account through Lake Formation. The Redshift UNLOAD that would write those files is not defined in code.                        | `mart` schema, read by the mart GraphQL API and the Athena PostgreSQL connector                                                                                                                    |

See the Data Warehouse Architecture document for resource names, network paths, and settings.

## Warehouse terminology

Use the vocabulary in `orcahouse-doc/glossary.md`. The table adds how each term applies here.

| Term                           | Meaning in this project                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ODS (Operational Data Store)   | Read-only operational source data. In the current project this role is played by the OrcaBus CDC tables in `awsdatacatalog`; in the legacy project, by the `ods` schema. |
| TSA (Transient Staging Area)   | Temporary landing tables, currently used for spreadsheet and ICA usage CSV data. The Glue jobs truncate and reload them.                                                 |
| PSA (Persistent Staging Area)  | Cleaned, append-only preservation of staged source records.                                                                                                              |
| DCL (Data Consolidation Layer) | The Data Vault 2.0 (DV2) portion of the warehouse.                                                                                                                       |
| RV (Raw Vault)                 | Source-faithful identities, relationships, and historical descriptive records.                                                                                           |
| BV (Business Vault)            | Derived business rules: effectivity, aliases, current-state calculations, and computed attributes. Partly implemented in the current project.                            |
| HUB (Hub Entity)               | A unique business identity and business key.                                                                                                                             |
| LNK (Link Entity)              | A relationship between two or more Hub identities.                                                                                                                       |
| SAT (Satellite Entity)         | Descriptive attributes or events that change over time.                                                                                                                  |
| EFFSAT (Effectivity Satellite) | A derived validity window (`effective_from`, `effective_to`, `is_current`) for a changing relationship. Present in both projects.                                        |
| SAL (Same-As Link)             | A relationship between alternative identifiers for the same business object. Present in both projects. Not listed in the glossary.                                       |
| DM (Data Mart)                 | A denormalized, consumer-oriented table for reporting or a specific business use case, in the `mart` schema.                                                             |
| IM (Information Mart)          | Defined in the glossary. No model in either project is labelled as an IM.                                                                                                |
| CDC (Change Data Capture)      | Source changes represented as insert/update/delete events. DMS writes the operation to `op` and the change time to `_dms_cdc_timestamp`.                                 |
| LDTS (Load Date Timestamp)     | Represented by `load_datetime`.                                                                                                                                          |
| RSRC (Record Source)           | Represented by `record_source`.                                                                                                                                          |

## Repository structure

The current project (`umccr/orcavault`) is laid out as follows:

```text
orcavault/
|- models/
|  |- cdc/
|  |  |- _sources.yml           awsdatacatalog.orcabus_* CDC tables (23 tagged cdc)
|  |  |- mm/                    16 ephemeral int_cdc_mm_* models + _int.yml
|  |  |- srm/                   3 ephemeral int_cdc_srm_* models + _int.yml
|  |  `- wfm/                   4 ephemeral int_cdc_wfm_* models + _int.yml
|  |- tsa/
|  |  `- _sources.yml           orcavault.tsa spreadsheet tables
|  |- legacy/
|  |  `- _sources.yml           awsdatacatalog.data_portal legacy tables
|  |- psa/
|  |  |- spreadsheet__google_lims.sql
|  |  |- spreadsheet__ica_usage_report.sql
|  |  |- spreadsheet__library_tracking_metadata.sql
|  |  `- _schema.yml
|  |- dcl/
|  |  |- raw_vault/
|  |  |  |- library/  sample/  subject/  project/
|  |  |  `- sequencing/  workflow/  s3object/
|  |  `- business_vault/
|  |     `- library/  workflow/  s3object/
|  `- mart/
|     `- centre/                7 marts + _schema.yml
|- macros/                      13 helper macros, plus:
|  |- ops/                      the watermark table and the run hooks that move it
|  `- watermark/                the bound macros and int_cdc_state
|- seeds/
|  `- mdm/                      mdm__workflow_run.csv + _schema.yml
|- tests/                       5 singular tests
|  `- fixtures/watermark/       4 unit tests (watermark.yml) and their input fixtures
|- docs/
|  `- watermark-architecture.md how incremental loading uses the watermark
|- analyses/  snapshots/        placeholders (.gitkeep)
|- dbt_project.yml
|- profiles.yml
|- packages.yml  package-lock.yml
|- requirements.txt
|- Makefile
|- Brewfile
|- dx.sh
|- mask_docs.py
|- README.md
`- README_DEV.md
```

### Root configuration

`dbt_project.yml`

- Defines the dbt project (`orcavault`) and standard resource paths.
- Uses `view` as the default materialization.
- Materializes PSA models as tables in the `psa` schema.
- Materializes DCL models as tables in the `dcl` schema; most DCL models override this with incremental configs.
- Materializes mart models as tables in the `mart` schema.
- Places seeds in the `seed` schema.
- Runs hooks around every command. `on-run-start` creates the `ops` schema and the `ops.cdc_watermark` table, and records where this run reads each CDC table up to. `on-run-end` moves the watermark forward after a complete `run` or `build` (see [CDC watermark](#cdc-watermark)).
- Sets `cdc_position_margin_minutes` (10), the overlap between one run's window and the next.

`profiles.yml`

- Defines a single `dev` target: an IAM-authenticated Redshift connection.
- Uses port `5439`, database `orcavault`, region `ap-southeast-2`, and 4 threads.
- Expects the host and user in the `DBT_ENV_SECRET_HOST` and `DBT_ENV_SECRET_USER` environment variables.
- Is configured for the remote AWS development environment (Redshift `orcahouse-dev`) rather than a local PostgreSQL database. No prod target is defined.
- Is not used by the run service. Its image replaces this file with a profile whose `ecs` target authenticates with the task's IAM role and reads the workgroup endpoint from `ORCAVAULT_REDSHIFT_HOST`, so the same image serves dev and prod.

`dx.sh`

- Resolves the endpoint of the Redshift Serverless workgroup `orcahouse-dev`.
- Fetches the management host's SSH key from the SSM parameter `orcahouse-mgmt`.
- Provides SSH (through the EC2 Instance Connect Endpoint) and SSM port-forwarding helpers that expose Redshift on `127.0.0.1:5439`. The helpers are named `house_*`, for example `house_tunnel` and `house_cred`.
- Exports the dbt connection environment variables.

`Makefile`

- Installs pre-commit hooks and the Python requirements, and runs developer checks.
- Supports secret scanning (trufflehog, ggshield) and the detect-secrets baseline.
- Generates dbt documentation (`dbt docs generate`, then `mask_docs.py`, which replaces database owner names in the catalog) and serves it.
- Runs dbt dependency installation and tests.
- Does not create a local warehouse stack like the legacy Makefile did.

### Standard dbt directories

`models/`

- Contains SQL transformations and upstream source declarations.
- A `.sql` model normally becomes a database relation with the same name. Ephemeral models (`models/cdc`) are inlined into the models that use them instead.
- `ref('model_name')` creates a dependency on another dbt model.
- `source('source_name', 'table_name')` refers to an existing upstream table.

`macros/`

- Contains reusable Jinja/SQL functions.
- `generate_hash_diff` produces a null-safe SHA-256 hash across a list of columns.
- `generate_s3object_hk` builds the S3 object hash key from the `s3://bucket/key` URI.
- `generate_schema_name` prevents dbt from prefixing custom schema names.
- The `extract_*` macros parse library, portal run, sequencing run, and cohort identifiers out of paths such as S3 keys.
- `cast_varchar_to_boolean`, `generate_series`, and `split_part_from_right` cover Redshift gaps relative to PostgreSQL.
- `ops/` holds `create_ops_tables`, `update_source_pending`, and `update_source_positions`, which the project hooks call to maintain `ops.cdc_watermark`.
- `watermark/` holds the bound macros (`cdc_upper_bound`, `cdc_window`, `cdc_bound`, `load_bound`, and the `cdc_watermark_value` helper) and `int_cdc_state`, which builds most current-state `int_cdc_*` models.

`seeds/`

- Contains small CSV-managed reference data.
- `mdm__workflow_run.csv` records equivalent or aliased workflow run identifiers (`base_portal_run_id`, `alias_portal_run_id`). It feeds `sal_workflow_run`.

`tests/`

- `assert_cdc_fm_recent.sql` (severity `warn`) reports when the File Manager `s3_object` watermark's `pending` is more than three days old.
- `assert_cdc_positions_valid.sql` checks that no `position` or `pending` in `ops.cdc_watermark` is in the future.
- `assert_cdc_sources_bounded.sql` checks that every model that reads an `orcabus_*` source calls a `cdc_` bound macro for that source.
- `assert_ica_usage_tsa_columns_captured.sql` (severity `warn`) reports TSA ICA usage columns that the PSA model does not carry.
- `assert_s3object_partitions_concatenate.sql` checks that the File Manager CDC partition values have the shape the `sat_s3object_fm` incremental filter depends on.
- `fixtures/watermark/watermark.yml` defines four unit tests of the CDC windows, on `int_cdc_mm_library`, `sat_sequencing_run_state`, `hub_s3object`, and `hub_library`. They set the watermark through the `cdc_watermark_overrides` variable, because unit tests cannot mock `ops.cdc_watermark`.

`analyses/` and `snapshots/`

- Are standard dbt locations.
- They are currently placeholders and do not contain project logic.

## Source and staging modules

### `models/tsa`

TSA declares existing transient spreadsheet tables in the `orcavault.tsa` schema:

- `spreadsheet__google_lims`
- `spreadsheet__ica_usage_report`
- `spreadsheet__library_tracking_metadata`

The OrcaGlue project owns these tables. Each module's `job/init.sql` creates its table at deploy time (run manually in Redshift Query Editor v2), and each run of the Glue job (`orcaglue-<stage>-spreadsheet-*-job`) truncates the table and copies in the latest extract through the Redshift Data API. The tables must be deployed and populated before the PSA models can run.

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

- `spreadsheet__google_lims` stores cleaned Google LIMS rows and uses the source timestamp as its incremental watermark (`timestamp` plus 11 hours, compared with the latest `load_datetime`).
- `spreadsheet__library_tracking_metadata` appends spreadsheet states that have not already been persisted.
- `spreadsheet__ica_usage_report` stores 40 source fields from the ICA usage report TSA table. It covers both the ICA Usage Explorer layout (reports up to 2026-04) and the BioInsight Core layout (from the 2026-05 report). It types monetary, quantity, date, and boolean fields, labels each load, and uses `usage_hash` as its incremental identity: a SHA-256 hash (`generate_hash_diff`) of the cleaned `usage_id`, `row_seq`, and `billing_date`. Rows in the older layout hash `row_seq` as empty.

The ICA model intentionally checks new hashes only against the existing PSA table. Duplicate rows sharing a previously unseen hash within one TSA snapshot are therefore retained for audit compatibility, while later snapshots with an already-persisted hash are not appended. Corrections that reuse the same `usage_id`, `row_seq`, and `billing_date` are outside this model's history contract.

The ICA model also protects its history. It ignores a project-wide `--full-refresh`; a rebuild needs `--vars '{ica_usage_full_refresh: true}'` and is lossless only while TSA still holds every source row. New output columns are added in place (`on_schema_change='append_new_columns'`).

The upstream `spreadsheet__ica_usage_report` TSA table is owned and loaded by the separate OrcaGlue project. The legacy equivalent, `tsa.ica_usage_report` in `orcahouse-db` (loaded by the legacy Glue job `orcahouse-csv-ica-usage-report-job`), and the legacy per-portal-run cost path remain part of a separate migration (see [What has not yet been migrated](#what-has-not-yet-been-migrated)).

### `models/cdc`

This module declares the OrcaBus CDC tables in `awsdatacatalog`:

- `orcabus_sequence_run_manager`
- `orcabus_workflow_manager`
- `orcabus_metadata_manager` (tables named `app_*`)
- `orcabus_filemanager` (`s3_object`, `s3_crawl`)

AWS DMS replicates the four OrcaBus databases to the prod S3 landing zone, and Glue crawlers catalogue the files daily into these Glue databases. Both Redshift workgroups are granted the same `orcabus_*` databases, so the dev and prod warehouses read the same production OrcaBus data.

The `mm/`, `srm/`, and `wfm/` folders hold 23 ephemeral `int_cdc_*` models. They create no tables. Thirteen of them call the `int_cdc_state` macro, which keeps the latest row per key up to the run's `pending` time and adds a `cdc_changed` flag that is true when that row falls in the run's window. The association models compute `cdc_changed` inline, as true when any side changed. Incremental consumers filter on `cdc_changed` rather than windowing these models, because a join can need rows that did not change.

The 23 source tables that models read are tagged `cdc` in `_sources.yml`, and each has a row in `ops.cdc_watermark`. A model can read an `orcabus_*` table only if the table is tagged and the read is bounded: the bound macros raise a compile error for an untagged table, and `assert_cdc_sources_bounded` fails for an unbounded read.

The models commonly consume:

- `op`, representing the CDC operation.
- `_dms_cdc_timestamp`, representing the source change timestamp.

The source YAML exposes more upstream tables than are currently consumed by DCL models. Source declaration does not imply migration completeness.

### `models/legacy`

This source module declares 17 historical Data Portal tables (`legacy_data_portal_*`) in the `data_portal` Glue database (`awsdatacatalog.data_portal`). How these tables were loaded is not defined in these repositories.

Legacy records are normally excluded from daily execution. Relevant models enable them with:

```bash
dbt run --vars '{"load_legacy": true}'
```

Legacy-only satellites compile to a zero-row, correctly typed query (`where 1 = 0`) during ordinary daily runs.

## Data Vault conventions

### Hubs

Hubs store:

- A SHA-256 hash key such as `library_hk`.
- The human/business key such as `library_id`.
- `load_datetime`.
- `record_source`.
- `last_seen_datetime`.

Hubs use Redshift incremental `merge` behavior. Existing identities retain their original load/source information while `last_seen_datetime` is updated.

### Links

Links store:

- A hash representing the complete relationship.
- The hash keys of the connected Hubs.
- `load_datetime`.
- `record_source`.

Links use incremental append behavior. They preserve relationships seen across spreadsheets, legacy data, and active OrcaBus sources.

### Satellites

Satellites store:

- The parent Hub or Link hash.
- `load_datetime`.
- `record_source`.
- `hash_diff`.
- Source-specific descriptive attributes or events.

Active CDC satellites also retain `op` and `_dms_cdc_timestamp`.

Raw Vault satellites intentionally preserve raw history. A delete event is recorded rather than automatically removing the previous row.

### Business Vault entities

- Effectivity Satellites (`effsat_*`) attach to a Link and add `effective_from`, `effective_to`, and `is_current`.
- Same-As Links (`sal_*`) map an alias identifier to its base identifier (`base_*_hk`, `alias_*_hk`).
- Current-state and computed Satellites derive interpreted attributes per parent, for example `sat_workflow_run` (status, start, end, latest comment, deletion) and `sat_s3object_by_run` (portal run and sequencing run parsed from the S3 key).

### Contracts and tests

Every Raw Vault and Business Vault model (61 models) has a domain-local YAML definition (`_hub.yml`, `_link.yml`, `_sat.yml`, `_effsat.yml`, `_sal.yml`, or `_int.yml`) with an enforced contract. Together with the generic tests, these provide some combination of:

- Enforced column data types.
- Primary-key expectations.
- Uniqueness tests.
- Not-null tests.
- Hub/Link relationship tests.
- Unique combinations of parent keys.

At review time, the YAML declared about 320 generic tests: 233 in the Raw Vault, 81 in the Business Vault, and 6 on the ICA usage PSA model. PSA and mart models do not enforce contracts. Five singular tests and four unit tests live in `tests/`. A full `dbt build` on 2026-10-20 ran 325 data tests and 4 unit tests.

Changes to a SQL model and its YAML contract should be made together.

## Raw Vault domain modules

The current Raw Vault contains 46 SQL models:

- 11 Hubs
- 12 Links
- 23 Satellites

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

Library-to-sequencing-run satellites (on `link_library_sequencing_run`):

| Satellite                          | Source                                   |
| ---------------------------------- | ---------------------------------------- |
| `sat_library_sequencing_run_glims` | Google LIMS spreadsheet, legacy backfill |
| `sat_library_sequencing_run_plims` | Legacy Data Portal LIMS row              |
| `sat_library_sequencing_run_srm`   | Active OrcaBus Sequence Run Manager CDC  |

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

The internal subject is sourced from the Metadata Manager individual identity. The external subject is sourced from the Metadata Manager subject identity. Both Hubs also take identifiers from the spreadsheets and the legacy Data Portal.

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

No Business Vault satellite derives the current sequencing-run state, latest comment, or deletion yet.

### Workflow domain

Models:

- `hub_workflow_run`
- `sat_workflow_run_detail`
- `sat_workflow_run_state`
- `sat_workflow_run_comment`
- `sat_workflow_run_portal_legacy`

The Hub business key is `portal_run_id`.

The active satellites keep workflow definition/run attributes, each state transition, and comments as separate source-faithful histories. The Business Vault derives the current view from them (see [Workflow](#workflow)).

### S3 object domain

Models:

- `hub_s3object`
- `sat_s3object_fm`: File Manager CDC event history, including delete-marker, archive, and accessibility fields
- `sat_s3object_portal`: legacy Data Portal S3 objects

The business key is the full S3 location derived from bucket and key.

This is the highest-volume Hub. Its model documents a special initial-load sequence:

1. Run the active File Manager CDC load first.
2. Run the legacy load second with `load_legacy: true`.

## Business Vault modules

The current Business Vault contains 15 SQL models.

### Library

- Seven Effectivity Satellites: `effsat_library_experiment`, `effsat_library_sample`, `effsat_library_external_sample`, `effsat_library_internal_subject`, `effsat_library_external_subject`, `effsat_library_project`, and `effsat_library_ownership`.
- `sal_library` maps top-up and rerun library identifiers to their base library.

### Workflow

- `sal_workflow_run` maps alias portal run identifiers to their base run, from the `mdm__workflow_run` seed.
- `sat_workflow_run` consolidates the current workflow-run view: workflow name, version, code version, and validation state, run status, start, end, latest comment, and `is_deleted`. It reads the Raw Vault detail, state, comment, and legacy portal satellites, resolved through `sal_workflow_run`.
- `sat_workflow_run_ica_usage` attaches ICA usage rows to workflow runs, from the ICA usage PSA model and the Workflow Manager CDC. Like the PSA model, it ignores a project-wide `--full-refresh`.

### S3 object

- `sat_s3object_fm_current`: current version state per object (`effective_from`, `effective_to`, `is_current`, `is_deleted`).
- `sat_s3object_by_library`: library identifier, filename, and up to four file extensions parsed from the key.
- `sat_s3object_by_run`: portal run identifier, sequencing run identifier, filename, and extensions parsed from the key.
- `int_bucket_fm`: lookup table of the buckets indexed by the File Manager, used by marts to decide File Manager coverage.

## Information Delivery (marts)

The current project has seven Centre marts in `models/mart/centre`. They are tables in the `mart` schema with Redshift distribution and sort keys, and they do not enforce contracts.

| Mart                   | Legacy counterpart                                           |
| ---------------------- | ------------------------------------------------------------ |
| `lims`                 | `lims`                                                       |
| `fastq`                | `fastq`                                                      |
| `bam`                  | `bam`                                                        |
| `vcf`                  | `vcf`                                                        |
| `workflow`             | `workflow`                                                   |
| `workflow_cost_report` | `workflow_cost_report`                                       |
| `workflow_output`      | `output` (same description; column equivalence not verified) |

The legacy project labels each mart STABLE or DEMO in its `dictionary__data_mart_catalog` seed, and the OrcaHouse UI mirrors those labels. The current project has no catalog seed.

## Incremental loading behavior

Incremental identity is source-specific:

- Google LIMS uses its source timestamp as a watermark.
- Library tracking metadata compares complete cleaned spreadsheet states.
- ICA usage compares `usage_hash` (`usage_id`, `row_seq`, `billing_date`) with persisted PSA history.
- Active CDC models read the window of commit times (`_dms_cdc_timestamp`) recorded in `ops.cdc_watermark` (see [CDC watermark](#cdc-watermark)). `sat_s3object_fm` also prunes by the landing-zone date partition.
- Models that read other warehouse models compare `load_datetime` with their own `max(load_datetime)` (`load_bound`).

The principal patterns are:

- Hubs: incremental `merge`, keyed by Hub hash, updating `last_seen_datetime`.
- Links: incremental `append`, with existing relationship hashes excluded.
- Raw Vault Satellites: incremental `append`, with existing `hash_diff` values excluded.
- Frozen legacy satellites: one-time load followed by a daily no-op.
- Effectivity Satellites: incremental `merge` on `hash_diff`, updating `effective_to` and `is_current`.
- Same-As Links and current-state Satellites: incremental `merge` on their key.

`load_datetime` is the dbt run start time (`run_started_at`) for most models. The Google LIMS PSA model derives it from the source timestamp.

### CDC watermark

A CDC row becomes visible in Redshift Spectrum only after DMS writes its file to S3, so a model cannot compare commit times with its own `load_datetime` without missing late rows. The project therefore keeps its own record of how far it has read each CDC table. `umccr/orcavault` documents the design in `docs/watermark-architecture.md`.

- `ops.cdc_watermark` has one row per `cdc`-tagged source table: `position` (every model has processed the table's commits up to here; null means from the start), `pending` (where the current run reads up to), `pending_invocation_id`, and `updated_at`.
- At the start of every `run` or `build`, `update_source_pending` sets each table's `pending` to its newest visible `_dms_cdc_timestamp`. Every model in the run reads the same rows.
- Models bound their reads with `cdc_window` (after `position`, up to `pending`) or `cdc_upper_bound` (everything up to `pending`, for lookups and current state). `cdc_bound` picks the window for incremental runs and the upper bound otherwise.
- At the end of the run, `update_source_positions` moves every `position` to `pending` minus `cdc_position_margin_minutes`, but only if every non-ephemeral model succeeded and the run was not a `load_legacy` or `--empty` run. Otherwise all positions stay, and the next run reads the same window again. Incremental models skip rows they already have, so a re-read is safe but slower.
- To re-read a CDC table, move its `position` back (or set it to null). To re-read from warehouse models, pass `--vars '{"reread_from": "<timestamp>"}'`, which replaces the `load_bound` lower bound.
- Do not run dbt during a DMS full load, and do not overlap runs. The run service enforces the second.

Do not use `--full-refresh` casually. Recreating an incremental model changes or destroys the warehouse load-history semantics represented by `load_datetime`. The ICA usage models ignore a project-wide `--full-refresh` for this reason.

## Current project versus legacy project

| Area                      | Current standalone OrcaVault                                                                                                                              | Legacy OrcaVault                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Repository shape          | Independent repository                                                                                                                                    | Subdirectory of the OrcaHouse monorepo                                                                                           |
| Warehouse engine          | Amazon Redshift Serverless (`orcahouse-dev`, `orcahouse-prod`)                                                                                            | Aurora PostgreSQL (`orcahouse-db`, engine 16.11)                                                                                 |
| dbt adapter               | `dbt-redshift` 1.10.2 with dbt-core 1.11.12 (pinned)                                                                                                      | `dbt-postgres` with dbt-core (unpinned)                                                                                          |
| Development model         | Remote AWS warehouse through IAM and a tunnel                                                                                                             | Local PostgreSQL 16.4 Docker stack plus a production target                                                                      |
| Runtime                   | Daily `dbt build` at 03:00 Australia/Melbourne in dev and prod (Step Functions and ECS Fargate, `infra/orcavault-run`), plus manual developer runs in dev | ECS Fargate, daily at 13:40 UTC, followed by `grant_select`                                                                      |
| CDC incremental bound     | Per-table watermark in `ops.cdc_watermark`, moved only after a complete run                                                                               | Not applicable: reads the `ods` schema and `psa.event__*` tables                                                                 |
| Operational source access | CDC tables through `awsdatacatalog` (DMS, S3, Glue crawlers)                                                                                              | `ods` schema (FDW per `orcahouse-doc`; not defined in code) and `psa.event__*` tables from the ingest Lambdas                    |
| Legacy source access      | Explicit one-time backfill from `awsdatacatalog.data_portal`                                                                                              | `legacy` schema, combined with active sources on every run                                                                       |
| DCL organization          | Domain folders under `raw_vault/` and `business_vault/`                                                                                                   | Flat `models/dcl` directory                                                                                                      |
| Physical optimization     | Redshift distribution and sort keys                                                                                                                       | PostgreSQL B-tree and GIN indexes                                                                                                |
| Hash implementation       | Redshift `sha2()`                                                                                                                                         | PostgreSQL `encode(sha256(...), 'hex')`                                                                                          |
| Model contracts and tests | Enforced contracts on all 61 DCL models in domain-local YAML, plus generic data tests, 5 singular tests, and 4 unit tests                                 | Enforced contracts on all 59 DCL models in per-entity-type YAML (`hub_schema.yml`, `link_schema.yml`, and others); no data tests |
| Raw CDC operations        | Retained in active satellites                                                                                                                             | Read from current and `historical*` ODS tables                                                                                   |
| Effectivity               | Seven `effsat_*` models                                                                                                                                   | Seven `effsat_*` models                                                                                                          |
| Alias resolution          | `sal_library`, `sal_workflow_run`                                                                                                                         | `sal_library`, `sal_workflow_run`                                                                                                |
| S3 history/intelligence   | Event history, current state, library and run parsing                                                                                                     | Event history, current state, library and run parsing                                                                            |
| Costs                     | ICA usage PSA, `sat_workflow_run_ica_usage`, `workflow_cost_report`                                                                                       | The same, plus `psa.cost__ica_cost_per_prid`, `sat_workflow_run_cost_ica`, and `workflow_cost`                                   |
| Variants                  | Not migrated                                                                                                                                              | `sat_variant_monitoring_result`, `variant_monitoring_result`                                                                     |
| Consumer marts            | Seven Centre marts                                                                                                                                        | 22 mart models: 21 catalogued marts plus the `catalog` view                                                                      |
| Seeds                     | `mdm__workflow_run` (schema `seed`)                                                                                                                       | `dictionary__data_mart_catalog`, `mdm__workflow_run` (schema `dcl`)                                                              |

### Model-count comparison

Current project (`umccr/orcavault` at `27cde93`):

- 94 SQL models total
- 23 ephemeral CDC intermediates
- 3 PSA models
- 46 Raw Vault models
- 15 Business Vault models
- 7 marts

The current DCL (Raw and Business Vault) includes:

- 11 Hubs
- 12 Links
- 28 Satellites (23 Raw Vault, 5 Business Vault)
- 7 Effectivity Satellites
- 2 Same-As Links
- 1 helper table (`int_bucket_fm`)

Legacy project (`umccr/orcahouse`, `orcavault/`, at `008332e`):

- 84 SQL models total
- 3 PSA models
- 59 DCL models
- 22 mart models

The legacy DCL includes:

- 11 Hubs
- 12 Links
- 27 Satellites
- 7 Effectivity Satellites
- 2 Same-As Links

Both projects use the same Hub, Link, Effectivity Satellite, and Same-As Link names. They differ in their Satellites.

## What has been preserved or improved

The migration preserves the foundational business-key network:

- The same 11 Hub identities exist.
- The same 12 core Link relationships exist.
- The same seven Effectivity Satellites and two Same-As Links exist.
- The primary library metadata satellites remain.
- Project, subject, workflow, sequencing-run, and S3 identities remain recognizable.

The new design improves:

- Separation between one-time legacy loads and active daily sources.
- Explicit source priority and `record_source`.
- Preservation of CDC operation and source timestamps.
- Domain-oriented organization.
- Redshift-specific physical design.
- Reusable hash-diff generation.
- Domain-local contracts, backed by uniqueness, not-null, and relationship tests (the legacy project enforces contracts but has no data tests).
- Separation of workflow/sequence state, comment, and detail histories.
- Protection of the ICA usage history against accidental full refreshes.

## What has not yet been migrated

### Business Vault/current-state logic

Now present in the current project: relationship effectivity windows, Same-As Link resolution for library and workflow-run aliases, and a consolidated current workflow-run satellite.

Still missing:

- Current-state derivations for sequencing runs (latest state, latest comment, deletion), which the Raw Vault comments assign to the Business Vault.

### File Manager and S3 intelligence

Now present: S3 event history (`sat_s3object_fm`), current version and delete state (`sat_s3object_fm_current`), and library and run parsing with filename and extension interpretation (`sat_s3object_by_library`, `sat_s3object_by_run`).

No model-level gap is known. Whether the parsing rules match the legacy models has not been verified.

### Sequence and workflow enrichments

Now present: library-to-sequencing-run relationship attributes, and ICA usage per workflow run with the `workflow_cost_report` mart.

Still missing:

- Sequence-run samplesheet content/history (legacy `sat_sequencing_run_samplesheet`).
- Workflow payload content history. The legacy `sat_workflow_run_detail` carries the payload reference, version, and data; the current `sat_workflow_run_state` keeps only `payload_id`.
- Legacy Data Portal workflow input and output JSON (in the legacy `sat_workflow_run_portal`, absent from `sat_workflow_run_portal_legacy`).
- ICA cost per portal run: the legacy path `psa.cost__ica_cost_per_prid` to `sat_workflow_run_cost_ica` to the `workflow_cost` mart. What writes `psa.cost__ica_cost_per_prid` is not defined in code.
- Variant-monitoring result history (legacy `sat_variant_monitoring_result`). Its source is the `psa.event__variant_monitoring_result` table, which only the legacy EventBridge ingest path fills. DMS replicates only the four databases listed above, so this source has no path into the current project yet.

### Information Delivery / marts

The following legacy marts are not present in the current project:

- FASTQ history (`fastq_history`)
- Output locations (`output`; the current project has `workflow_output` with the same description)
- Workflow cost (`workflow_cost`)
- Variant monitoring (`variant_monitoring_result`)
- Accreditation LIMS (`accreditation_lims`)
- Data mart catalog (`catalog`)
- Curation LIMS (`curation_lims`)
- Dawson, Grimmond, and Tothill views (`dawson_lims`, `dawson_fastq`, `grimmond_lims`, `tothill_lims`, `tothill_fastq`)
- External LIMS (`external_lims`)
- Library services, library aliases, and do-not-sequence (DNS) error marts (`em_library_services`, `em_library_aliases`, `em_library_dns`)

Of these, the legacy catalogue labels `fastq_history`, `output`, `accreditation_lims`, `external_lims`, and the three error marts as STABLE.

A user or API that depends on a legacy `mart.*` table cannot be switched to the current project until two things exist: the mart and its Business Vault dependencies with equivalent columns, and a delivery path from Redshift to that consumer. Today the mart API reads PostgreSQL only, and the Lake Formation share covers only the dev mart database.

## Access and consumption

How consumers reach OrcaVault data today:

| Path                                                                                        | Reads from                                                             | Access control                                                                      | Notes                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| OrcaHouse UI and the mart GraphQL API (`https://mart.prod.umccr.org/graphql`)               | Legacy `orcahouse-db`, `mart` schema                                   | Cognito JWT checked by API Gateway; read-only database user (`orcahouse/dbuser_ro`) | GraphQL over POST only; mutations disabled. Only a prod API exists. |
| Athena workgroup `orcahouse`, data source `orcavault`, database `mart` (UMCCR prod account) | Legacy `orcahouse-db` reader endpoint                                  | IAM in the UMCCR prod account; database user `orcahouse/orcavault/athena`           | For example, `select * from orcavault.mart.lims`                    |
| Glue resource links `mart` and `result` (UMCCR prod account)                                | Warehouse Glue databases `orcavault_dev_mart` and `oncovault_dev_mart` | Lake Formation grants to the `ProdOperator` and `ProdDataExplorer` SSO roles        | Dev mart databases only                                             |
| Redshift Query Editor v2, or dbt through the tunnel                                         | Redshift `orcahouse-dev`                                               | `AWSPowerUserAccess` SSO role; IAM authentication                                   | Developer access                                                    |
| Database tunnels through the management hosts                                               | `orcahouse-db` (UMCCR) or Redshift (warehouse)                         | AWS SSM or EC2 Instance Connect                                                     | No database has a public endpoint                                   |

## Security and governance

- No public database endpoints. Aurora and Redshift run in private subnets. People reach them through the management hosts (SSM, EC2 Instance Connect Endpoint). The warehouse account reaches the OrcaBus database through an AWS PrivateLink endpoint service.
- Credentials live in AWS Secrets Manager. The `orcahouse-db` service users (`orcahouse/dbuser_ro`, `orcahouse/orcavault/athena`, `orcahouse/orcavault/psa_rw`, `orcahouse/orcavault/tsa_rw`) rotate daily. The Aurora master and Redshift admin passwords are managed by the services. dbt connects to Redshift with IAM authentication.
- The legacy daily dbt run still uses the Aurora master credential; a FIXME in `infra/ecs/legacy/orcavault-dbt/iam.tf` records that a dedicated dbt user is not provisioned yet.
- The current run service connects to Redshift with IAM authentication as the database user `IAMR:orcavault-run-<env>-dbt-task-role`, which holds the `orcavault_builder` role. A Redshift admin granted both once per workgroup. Its task role reads the `orcabus_*` Glue databases through Lake Formation grants, and can write only `runs/*/event.json` in its results bucket.
- Lake Formation in the warehouse account runs in Lake Formation-only mode (no default IAMAllowedPrincipals grants). Grants go to SSO roles, the Redshift namespace roles, and the Glue crawler roles. Cross-account sharing uses AWS RAM plus Lake Formation grants.
- The mart API requires a Cognito JWT for `POST /graphql`. The `GET /graphiql` page has no authorizer; queries sent from it still need a token.
- Data at rest is encrypted: the warehouse-account S3 buckets use SSE-S3, the Aurora clusters have storage encryption on, and Redshift uses its default encryption (no customer-managed key is configured). The UMCCR staging buckets are managed outside Terraform.
- Lake Formation column-, row-, and cell-level controls (LF-Tags, data filters) are possible but not defined in code.

## Operations

- Schedules (UTC, as coded). Legacy path: Glue TSA jobs at 13:10, ECS dbt at 13:40, AWS Backup of `orcahouse-db` on Sundays at 17:00, ingest Lambdas in real time. Warehouse account: DMS runs continuously, OrcaBus CDC crawlers at 15:00, mart crawlers at 18:00, OrcaGlue prod triggers for library tracking metadata at 13:25 and ICA usage at 13:40 (the Google LIMS prod trigger is disabled until a manual run is validated), and the OrcaVault run in both workgroups at 03:00 Australia/Melbourne, which is 16:00 UTC under AEDT and 17:00 UTC under AEST.
- Schedule comments in the code assume Australian daylight time (AEDT); under AEST the local times are one hour earlier. The OrcaVault run schedule uses the `Australia/Melbourne` time zone, so its UTC time moves instead.
- A run's outcome is `succeeded`, `warned` (only warn-severity tests failed), `failed` (a model, an error-severity test, or a hook failed), `error` (dbt could not run, or the run was stopped), or `skipped` (another run was still going). The Step Functions execution succeeds only for `succeeded` and `warned`. A failed model skips only its dependants; models that built stay loaded. Runs are not retried automatically: once the cause is fixed, start the state machine again with `{}`.
- Alerting in code, legacy path: ingest Lambda errors and dead-letter messages notify Slack through SNS topics named `AwsChatBotTopic-alerts`. The legacy Glue jobs and the ECS dbt task have no alerting.
- Alerting in code, warehouse account: the notification stack (`infra/notification`) sends failed or timed-out OrcaGlue jobs, failed Glue crawler runs and scheduled starts, and DMS `Failure` and `LowStorage` events to `#alerts-dev` and `#alerts-prod`, through EventBridge rules, the same `AwsChatBotTopic-alerts` topics, and a dead-letter queue. The run service sends an `OrcaVaultRunFinished` event at the end of every run and has a `no-recent-success` alarm (no successful run for 30 hours). As of 2026-10-20, neither the run event nor the alarm is forwarded to Slack. Redshift has no alerting in code.
- Operational ownership and on-call are not defined in code.

### Run status (2026-10-20)

Read from the warehouse account without changes:

- Dev has run seven times since 2026-10-15 and prod twice since 2026-10-19, all on `umccr/orcavault` `27cde93`. Every run ended `failed`.
- Every run fails the test `relationships_link_library_sequencing_run_library_hk__library_hk__ref_hub_library_` (41 rows in both environments). Prod also fails `relationships_sal_library_base_library_hk__library_hk__ref_hub_library_` (1 row). Every other test passed.
- Because of the failed tests, `mart.lims` is skipped in every run, and the CDC positions never move (`CDC positions not updated: 70 of 71 models succeeded`). Each run therefore re-reads every CDC table from its last recorded position.
- Both `no-recent-success` alarms have been in ALARM since their stacks were deployed. Their run events reached the default bus, but no rule consumed them.
- A dev run takes 10 to 15 minutes and a prod run 18 to 19 minutes. Dev used 19.8 RPU-hours from 2026-10-01 to 2026-10-20, well under the 120 RPU-hour monthly limit.

## Current state and direction

User-stated direction (2026-10-06): all OrcaHouse resources will move to the UniMelb warehouse account `115253169271`. Today that account runs all dev-environment processes and part of prod. The code does not define a timeline. One code comment points the same way: the `infra/lakeformation/environments/umccr-prod` backend has a FIXME to move its state "when the prod account has migrated to unimelb tenancy".

| Capability                                                                                                                             | Where it runs today                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OrcaBus CDC (DMS, landing zone, crawlers)                                                                                              | Warehouse account. One pipeline writes to the prod landing zone; dev and prod Redshift read the same catalog.                                                                                                                            |
| Spreadsheet and ICA usage TSA loads                                                                                                    | OrcaGlue in the warehouse account (dev and prod). The legacy Glue jobs in the UMCCR accounts still feed the live marts.                                                                                                                  |
| Transformation                                                                                                                         | Redshift `orcahouse-dev` and `orcahouse-prod` in the warehouse account, each built daily by the run service. The live marts are still built by the legacy dbt task in the UMCCR prod account.                                            |
| Failure alerts                                                                                                                         | Warehouse account, `infra/notification`, for OrcaGlue jobs, Glue crawlers, and DMS. OrcaVault runs are not covered yet.                                                                                                                  |
| Mart publication and sharing                                                                                                           | Warehouse account. `orcavault_dev_mart` has a crawler, a Lake Formation registration, and a share to the UMCCR prod account; `orcavault_prod_mart` has a crawler only.                                                                   |
| Serving (UI, mart API, Athena)                                                                                                         | UMCCR prod account, legacy warehouse only                                                                                                                                                                                                |
| Event ingestion (EventBridge to Lambda to PSA)                                                                                         | UMCCR prod account only; no equivalent in the warehouse account                                                                                                                                                                          |
| Aurora PostgreSQL for the OrcaNexus Data API (`orcanexus-<env>`, engine 18.6; formerly `orcahouse-<env>`, labelled "Data API backend") | Warehouse account. Defined for dev and prod; only `orcanexus-dev` exists. It has the Aurora Analytics feature, which queries Parquet, Iceberg, and S3 Tables through the Glue catalog, and S3 import. Nothing loads or reads it in code. |

## Working safely in the current project

### Before changing a model

1. Identify whether the model is a Hub, Link, Satellite, Effectivity Satellite, Same-As Link, or mart.
2. Identify every source system that owns the business key or relationship.
3. Check both the active CDC and optional legacy branches.
4. Check whether the model has a one-time/no-op legacy pattern.
5. Inspect the matching `_hub.yml`, `_link.yml`, `_sat.yml`, `_effsat.yml`, `_sal.yml`, or `_int.yml`.
6. Confirm Redshift-compatible types and SQL.
7. Preserve existing hash input ordering.
8. Preserve `record_source`, `load_datetime`, and CDC metadata unless a migration explicitly changes their semantics.
9. Check the Business Vault and mart models that depend on it.

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
- For an OrcaBus CDC table: the `cdc` tag in `models/cdc/_sources.yml` (and `cdc_partition_expression` in `meta` for a partitioned table), a bound macro on every read, and a model that skips rows it already has, because windows overlap and an incomplete run causes a re-read.

### When porting a legacy model

Do not copy it mechanically. Review:

- PostgreSQL `encode`, `bytea`, regex, array, JSONB, filtered aggregate, and index syntax.
- B-tree/GIN indexes, which should not be carried into Redshift.
- Appropriate Redshift distribution and sort keys.
- Whether the model is actually Raw Vault, Business Vault, or a mart.
- Whether legacy ODS sources now map to CDC catalog tables.
- Whether the legacy source has any path into the warehouse account (for example, the PSA event tables and `psa.cost__ica_cost_per_prid` do not).
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

Development requires an authenticated AWS session and a connection to the remote Redshift development environment. Consult `README.md`, `README_DEV.md`, and `dx.sh` in `umccr/orcavault` before attempting connected runs.

A merged change reaches the daily runs only after the release step in `infra/orcavault-run`: set the new ref as `orcavault_release_ref` in `environments/dev/release.auto.tfvars`, build and push the image, and apply dev; then do the same for prod. A one-off run can be started on the state machine with an input such as `{"args": "build --select lims+"}`; the command must be `build`, `run`, `test`, `seed`, or `snapshot`.

## Source-of-truth order

When information conflicts, use this order:

1. Current SQL models and YAML contracts in `umccr/orcavault`.
2. Current `dbt_project.yml`, `profiles.yml`, and development scripts.
3. Current git history and accepted migration decisions.
4. Infrastructure code in `umccr/orcahouse` (`infra/`), for accounts, resources, schedules, and access.
5. This document (`OrcaVault-PD.md`) and the Data Warehouse Architecture document.
6. OrcaHouse high-level architecture and glossary.
7. Legacy OrcaVault source code, for behavior that has not yet been migrated.
8. Generated dbt documentation and manually maintained ERDs, which may lag.

## Open questions

1. Ownership: who owns OrcaVault as a product, as data steward, and operationally (on-call, approvals)? Not recorded in code.
2. Migration plan: in what order, and by when, do the remaining prod resources move to account `115253169271`? The direction is user-stated; no timeline exists.
3. Daily run failures: every run since the run service started fails the relationship tests from `link_library_sequencing_run` and (in prod) `sal_library` to `hub_library`. This skips `mart.lims` and keeps the CDC positions from moving. Is the fix in the models, the source data, or the tests' severity? (The previous question, where prod would run, is answered by `infra/orcavault-run`.)
4. Mart publication: what will write the Parquet marts to `s3://orcavault-<env>-warehouse-…/v1/parquet/mart/`? The crawlers and Lake Formation setup expect a Redshift UNLOAD that is not defined in code.
5. Production sharing: the UMCCR prod resource link `mart` points at `orcavault_dev_mart`, and `orcavault_prod_mart` has no Lake Formation registration or grants. Is the dev share meant for production consumers?
6. Serving after migration: the mart API reads PostgreSQL. Will it move to the warehouse-account Aurora cluster for the OrcaNexus Data API (`orcanexus-<env>`, which can query Parquet through Aurora Analytics), to Redshift, or to the Lake Formation share?
7. Mart parity: which legacy marts must exist before consumers switch (in particular the STABLE ones), and is `workflow_output` the replacement for `output`?
8. Event-only sources: variant-monitoring results and the other OrcaBus events reach only the legacy PSA. How will they reach the warehouse account? Of the six legacy event tables, only `event__variant_monitoring_result` is used by a legacy dbt model.
9. ICA cost per portal run: what writes `psa.cost__ica_cost_per_prid`, and will `workflow_cost` be migrated or replaced by `workflow_cost_report`?
10. Dev isolation: the dev warehouse reads production OrcaBus CDC data through the shared catalog. Is that intended?
11. Legacy sources: how were the `awsdatacatalog.data_portal` tables loaded, and how are the legacy `ods` and `legacy` schemas in `orcahouse-db` populated? This matters for decommissioning the legacy stack.

## Current-state conclusion

OrcaVault remains the warehouse responsible for making fragmented OrcaBus and legacy genomic metadata historically understandable and queryable.

The current project is a cleaner Redshift-native foundation:

- It has the core business identities and relationship network.
- It preserves active CDC and legacy history.
- It has most of the legacy Business Vault: effectivity, alias resolution, current workflow-run state, and S3 intelligence.
- It has seven Centre marts.
- It is more explicit about source provenance, contracts, tests, and migration behavior, and tracks how far it has read each CDC table.
- It is built daily in dev and prod by the run service.

However, consumers still read the legacy PostgreSQL warehouse. The principal remaining work for functional parity is: daily runs that pass (they currently fail on Library relationship tests), the remaining marts (including several STABLE ones), sequencing-run current state, variant monitoring, samplesheet and payload history, ICA cost per portal run, failure alerts for the daily run, and a delivery path from Redshift to the UI, the mart API, and Athena users.

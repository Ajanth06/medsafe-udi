-- Erweiterung Dokumente-Modul (Medsafe UDI)
-- Führt neue Metadatenfelder für regulatorische Dokumentenlenkung ein.

alter table if exists docs
  add column if not exists doc_type text null,
  add column if not exists assignment_scope text default 'device',
  add column if not exists assigned_batch text null,
  add column if not exists assigned_product_group text null,
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists purpose text null;

alter table if exists docs
  drop constraint if exists docs_doc_type_check;

alter table if exists docs
  add constraint docs_doc_type_check
  check (
    doc_type is null or doc_type in (
      'declaration_of_conformity',
      'ifu',
      'risk_management_file',
      'test_report',
      'labeling',
      'dmr_master_document',
      'other'
    )
  );

alter table if exists docs
  drop constraint if exists docs_assignment_scope_check;

alter table if exists docs
  add constraint docs_assignment_scope_check
  check (assignment_scope in ('device', 'batch', 'product_group'));

create index if not exists docs_assignment_scope_idx on docs(assignment_scope);
create index if not exists docs_assigned_batch_idx on docs(assigned_batch);
create index if not exists docs_assigned_product_group_idx on docs(assigned_product_group);
create index if not exists docs_doc_status_idx on docs(doc_status);
create index if not exists docs_doc_type_idx on docs(doc_type);

alter table if exists devices
  add column if not exists device_category text null;

create index if not exists devices_device_category_idx on devices(device_category);

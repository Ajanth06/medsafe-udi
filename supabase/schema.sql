-- MedSafe-UDI: Basis-Schema + RLS
-- Ausführen in Supabase SQL Editor (vor den ALTER-Skripten bei Neuinstallation)

-- Geräte
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_by text null,
  name text not null,
  product_family text null,
  udi_di text not null,
  basic_udi_di text null,
  serial text not null,
  udi_hash text not null,
  udi_pi text null,
  batch text null,
  production_date text null,
  manufacturer_name text null,
  manufacturer_srn text null,
  device_version_variants text null,
  device_description text null,
  principle_of_operation text null,
  key_components text null,
  accessories text null,
  risk_file_id text null,
  fmea_id text null,
  hazard_analysis_ref text null,
  ce_status text null,
  notified_body text null,
  conformity_route text null,
  clinical_evaluation_ref text null,
  gspr_checklist_link text null,
  warnings_precautions text null,
  status text not null default 'released',
  risk_class text null,
  mdr_class text null,
  mdr_rule text null,
  intended_purpose text null,
  internal_risk_level text null,
  block_comment text null,
  responsible text null,
  is_archived boolean not null default false,
  dmr_id text null,
  dhr_id text null,
  validation_status text null,
  archived_at timestamptz null,
  archive_reason text null,
  nonconformity_category text null,
  nonconformity_severity text null,
  nonconformity_action text null,
  nonconformity_responsible text null,
  nonconformity_id text null,
  last_service_date timestamptz null,
  next_service_date timestamptz null,
  service_notes text null,
  pms_notes text null,
  generic_device_group text null,
  device_category text null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists devices_user_id_idx on devices(user_id);
create index if not exists devices_batch_idx on devices(batch);
create index if not exists devices_name_idx on devices(name);
create index if not exists devices_created_at_idx on devices(created_at desc);

-- Dokumente (Metadaten, Dateien in Storage-Bucket "docs")
create table if not exists docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_by text null,
  device_id uuid references devices(id) on delete cascade,
  name text not null,
  cid text not null,
  url text not null,
  category text null,
  doc_type text null,
  version text null,
  revision text null,
  doc_status text null default 'Controlled',
  approved_by text null,
  assignment_scope text default 'device',
  assigned_batch text null,
  assigned_product_group text null,
  is_mandatory boolean not null default false,
  purpose text null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists docs_device_id_idx on docs(device_id);
create index if not exists docs_user_id_idx on docs(user_id);
create index if not exists docs_created_at_idx on docs(created_at desc);

-- Audit-Log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id uuid references devices(id) on delete set null,
  action text not null,
  message text not null,
  timestamp timestamptz not null default now()
);

create index if not exists audit_log_timestamp_idx on audit_log(timestamp desc);
create index if not exists audit_log_device_id_idx on audit_log(device_id);
create index if not exists audit_log_user_id_idx on audit_log(user_id);

-- Versioniertes QMS (Bucket "documents")
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  document_key text not null,
  version integer not null default 1,
  revision text not null default 'R1',
  file_name text not null,
  storage_path text not null,
  mime_type text null,
  sha256 text null,
  is_current boolean not null default true,
  created_by text null,
  created_at timestamptz not null default now()
);

create index if not exists documents_document_key_idx on documents(document_key);
create unique index if not exists documents_key_version_uidx on documents(document_key, version);

-- KI-Chat
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Neue Unterhaltung',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_id_idx on ai_messages(conversation_id);

-- RLS: eigene Daten pro authentifiziertem Benutzer
alter table devices enable row level security;
alter table docs enable row level security;
alter table audit_log enable row level security;
alter table documents enable row level security;
alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;

-- devices
drop policy if exists "devices_select_own" on devices;
create policy "devices_select_own" on devices for select to authenticated
  using (auth.uid() = user_id or user_id is null);

drop policy if exists "devices_insert_own" on devices;
create policy "devices_insert_own" on devices for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "devices_update_own" on devices;
create policy "devices_update_own" on devices for update to authenticated
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "devices_delete_own" on devices;
create policy "devices_delete_own" on devices for delete to authenticated
  using (auth.uid() = user_id or user_id is null);

-- docs
drop policy if exists "docs_select_own" on docs;
create policy "docs_select_own" on docs for select to authenticated
  using (auth.uid() = user_id or user_id is null);

drop policy if exists "docs_insert_own" on docs;
create policy "docs_insert_own" on docs for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "docs_update_own" on docs;
create policy "docs_update_own" on docs for update to authenticated
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "docs_delete_own" on docs;
create policy "docs_delete_own" on docs for delete to authenticated
  using (auth.uid() = user_id or user_id is null);

-- audit_log (lesen + einfügen, kein update/delete)
drop policy if exists "audit_log_select_own" on audit_log;
create policy "audit_log_select_own" on audit_log for select to authenticated
  using (auth.uid() = user_id or user_id is null);

drop policy if exists "audit_log_insert_own" on audit_log;
create policy "audit_log_insert_own" on audit_log for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- documents
drop policy if exists "documents_select_own" on documents;
create policy "documents_select_own" on documents for select to authenticated
  using (auth.uid() = user_id or user_id is null);

drop policy if exists "documents_insert_own" on documents;
create policy "documents_insert_own" on documents for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- ai_conversations
drop policy if exists "ai_conversations_own" on ai_conversations;
create policy "ai_conversations_own" on ai_conversations for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ai_messages (über conversation ownership)
drop policy if exists "ai_messages_own" on ai_messages;
create policy "ai_messages_own" on ai_messages for all to authenticated
  using (
    exists (
      select 1 from ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Storage-Buckets (manuell in Supabase Dashboard anlegen):
--   docs       — Gerätedokumente
--   documents  — versioniertes QMS

-- Papierkorb: Soft-Delete für Geräte und Dokumente (30 Tage Aufbewahrung)

alter table if exists devices
  add column if not exists deleted_at timestamptz null;

alter table if exists docs
  add column if not exists deleted_at timestamptz null;

create index if not exists devices_deleted_at_idx on devices(deleted_at);
create index if not exists docs_deleted_at_idx on docs(deleted_at);

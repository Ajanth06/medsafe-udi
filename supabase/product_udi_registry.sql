create table if not exists product_udi_registry (
  id uuid primary key,
  user_id uuid null,
  created_by text null,
  product_name text not null,
  normalized_product_name text not null,
  customer_prefix text not null,
  udi_di text not null,
  manufacturer_name text null,
  manufacturer_srn text null,
  device_description text null,
  intended_purpose text null,
  principle_of_operation text null,
  key_components text null,
  accessories text null,
  device_version_variants text null,
  risk_file_id text null,
  fmea_id text null,
  hazard_analysis_ref text null,
  ce_status text null,
  notified_body text null,
  conformity_route text null,
  clinical_evaluation_ref text null,
  gspr_checklist_link text null,
  warnings_precautions text null,
  internal_risk_level text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_udi_registry_normalized_product_name_uidx
  on product_udi_registry(normalized_product_name);

create index if not exists product_udi_registry_user_id_idx
  on product_udi_registry(user_id);

create or replace function set_product_udi_registry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_udi_registry_updated_at on product_udi_registry;

create trigger trg_product_udi_registry_updated_at
before update on product_udi_registry
for each row
execute function set_product_udi_registry_updated_at();

alter table product_udi_registry enable row level security;

drop policy if exists "product_udi_registry_select_own" on product_udi_registry;
create policy "product_udi_registry_select_own"
on product_udi_registry
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "product_udi_registry_insert_own" on product_udi_registry;
create policy "product_udi_registry_insert_own"
on product_udi_registry
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "product_udi_registry_update_own" on product_udi_registry;
create policy "product_udi_registry_update_own"
on product_udi_registry
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "product_udi_registry_delete_own" on product_udi_registry;
create policy "product_udi_registry_delete_own"
on product_udi_registry
for delete
to authenticated
using (auth.uid() = user_id);

-- MDR/TD additional fields for devices (Annex I + Annex II focused)

alter table if exists devices
  add column if not exists basic_udi_di text null,
  add column if not exists manufacturer_name text null,
  add column if not exists device_version_variants text null,
  add column if not exists device_description text null,
  add column if not exists principle_of_operation text null,
  add column if not exists key_components text null,
  add column if not exists accessories text null,
  add column if not exists risk_file_id text null,
  add column if not exists fmea_id text null,
  add column if not exists hazard_analysis_ref text null,
  add column if not exists ce_status text null,
  add column if not exists notified_body text null,
  add column if not exists conformity_route text null,
  add column if not exists clinical_evaluation_ref text null,
  add column if not exists gspr_checklist_link text null;

create index if not exists devices_basic_udi_di_idx on devices(basic_udi_di);
create index if not exists devices_manufacturer_name_idx on devices(manufacturer_name);
create index if not exists devices_risk_file_id_idx on devices(risk_file_id);
create index if not exists devices_fmea_id_idx on devices(fmea_id);

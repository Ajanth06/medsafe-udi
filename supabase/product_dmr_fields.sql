-- DMR-Stammdaten auf product_udi_registry (Produktstammdaten)
alter table if exists product_udi_registry add column if not exists device_description text null;
alter table if exists product_udi_registry add column if not exists intended_purpose text null;
alter table if exists product_udi_registry add column if not exists principle_of_operation text null;
alter table if exists product_udi_registry add column if not exists key_components text null;
alter table if exists product_udi_registry add column if not exists accessories text null;
alter table if exists product_udi_registry add column if not exists device_version_variants text null;
alter table if exists product_udi_registry add column if not exists risk_file_id text null;
alter table if exists product_udi_registry add column if not exists fmea_id text null;
alter table if exists product_udi_registry add column if not exists hazard_analysis_ref text null;
alter table if exists product_udi_registry add column if not exists ce_status text null;
alter table if exists product_udi_registry add column if not exists notified_body text null;
alter table if exists product_udi_registry add column if not exists conformity_route text null;
alter table if exists product_udi_registry add column if not exists clinical_evaluation_ref text null;
alter table if exists product_udi_registry add column if not exists gspr_checklist_link text null;
alter table if exists product_udi_registry add column if not exists warnings_precautions text null;
alter table if exists product_udi_registry add column if not exists internal_risk_level text null;

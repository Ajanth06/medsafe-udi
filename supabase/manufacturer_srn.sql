-- EUDAMED Hersteller-SRN (Single Registration Number)
alter table if exists devices add column if not exists manufacturer_srn text null;
alter table if exists product_udi_registry add column if not exists manufacturer_srn text null;

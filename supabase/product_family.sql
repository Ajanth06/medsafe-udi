-- Produktfamilie (getrennt vom Produktmodell / name)
alter table if exists devices add column if not exists product_family text null;

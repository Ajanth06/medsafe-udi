-- MDR naming alignment for devices table
-- Adds MDR-aligned column names while keeping legacy compatibility.

alter table if exists devices
  add column if not exists generic_device_group text null;

update devices
set generic_device_group = coalesce(nullif(generic_device_group, ''), device_category)
where coalesce(nullif(generic_device_group, ''), '') = ''
  and coalesce(nullif(device_category, ''), '') <> '';

create index if not exists devices_generic_device_group_idx
  on devices(generic_device_group);

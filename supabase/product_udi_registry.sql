create table if not exists product_udi_registry (
  id uuid primary key,
  user_id uuid null,
  created_by text null,
  product_name text not null,
  normalized_product_name text not null,
  customer_prefix text not null,
  udi_di text not null,
  manufacturer_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_udi_registry_normalized_product_name_uidx
  on product_udi_registry(normalized_product_name);

create index if not exists product_udi_registry_user_id_idx
  on product_udi_registry(user_id);

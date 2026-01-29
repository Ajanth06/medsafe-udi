-- ISO 14971 Risk Analysis tables (MVP)

create table if not exists risk_analyses (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('product_group', 'device')),
  group_id uuid null,
  device_id uuid null,
  title text not null,
  standard text not null default 'ISO 14971',
  version int not null default 1,
  status text not null check (status in ('Draft', 'In Review', 'Approved', 'Obsolete')),
  prepared_by text not null,
  reviewed_by text null,
  approved_by text null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz null
);

create table if not exists fmea_rows (
  id uuid primary key default gen_random_uuid(),
  risk_analysis_id uuid not null references risk_analyses(id) on delete cascade,
  lifecycle_phase text not null check (lifecycle_phase in ('Design','Manufacturing','Distribution','Use','Service','Decommission')),
  process_step text not null,
  failure_mode text not null,
  effect text not null,
  cause text not null,
  existing_controls text not null,
  severity_s int not null,
  occurrence_o int not null,
  detection_d int not null,
  rpn int not null,
  risk_level text not null,
  recommended_actions text not null,
  action_owner text null,
  action_due date null,
  action_status text not null default 'Open' check (action_status in ('Open','In Progress','Done')),
  residual_severity_s int null,
  residual_occurrence_o int null,
  residual_detection_d int null,
  residual_rpn int null,
  created_at timestamptz not null default now()
);

create table if not exists fishbone_nodes (
  id uuid primary key default gen_random_uuid(),
  risk_analysis_id uuid not null references risk_analyses(id) on delete cascade,
  problem_statement text not null,
  branch text not null,
  item text not null,
  created_at timestamptz not null default now()
);

create table if not exists risk_audit_log (
  id uuid primary key default gen_random_uuid(),
  risk_analysis_id uuid not null references risk_analyses(id) on delete cascade,
  action text not null,
  details jsonb null,
  created_at timestamptz not null default now(),
  actor text null
);

-- RLS (MVP: authenticated users can read/write)
alter table risk_analyses enable row level security;
alter table fmea_rows enable row level security;
alter table fishbone_nodes enable row level security;
alter table risk_audit_log enable row level security;

do $$ begin
  create policy "risk_analyses_rw" on risk_analyses
    for all to authenticated using (true) with check (true);
  create policy "fmea_rows_rw" on fmea_rows
    for all to authenticated using (true) with check (true);
  create policy "fishbone_nodes_rw" on fishbone_nodes
    for all to authenticated using (true) with check (true);
  create policy "risk_audit_log_rw" on risk_audit_log
    for all to authenticated using (true) with check (true);
exception when duplicate_object then
  null;
end $$;

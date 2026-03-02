create table if not exists cfd_signal_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument text not null check (instrument in ('EUR/USD', 'DAX', 'WTI')),
  signal text not null check (signal in ('BUY', 'SELL', 'WAIT')),
  confidence int not null,
  regime text not null check (regime in ('Trend', 'Range')),
  price text not null,
  signal_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists cfd_signal_history_unique_signal
  on cfd_signal_history (user_id, instrument, signal, signal_timestamp);

create table if not exists cfd_trade_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument text not null check (instrument in ('EUR/USD', 'DAX', 'WTI')),
  signal text not null check (signal in ('BUY', 'SELL', 'WAIT')),
  entry text not null,
  stop_loss text not null,
  take_profit text not null,
  status text not null check (status in ('planned', 'executed', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table cfd_signal_history enable row level security;
alter table cfd_trade_journal enable row level security;

do $$ begin
  create policy "cfd_signal_history_select_own" on cfd_signal_history
    for select to authenticated using (auth.uid() = user_id);
  create policy "cfd_signal_history_insert_own" on cfd_signal_history
    for insert to authenticated with check (auth.uid() = user_id);
  create policy "cfd_trade_journal_rw_own" on cfd_trade_journal
    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then
  null;
end $$;

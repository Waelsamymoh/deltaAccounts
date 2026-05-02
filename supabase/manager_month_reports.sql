-- Run in Supabase SQL Editor

create table if not exists manager_month_reports (
  id uuid primary key default uuid_generate_v4(),
  month_id uuid not null references manager_months(id) on delete cascade,
  amount_in numeric(15,2) not null default 0,
  amount_out numeric(15,2) not null default 0,
  profits numeric(15,2) not null default 0,
  balance_after_profit numeric(15,2) not null default 0,
  notes text,
  date date not null default current_date,
  created_at timestamptz default now()
);

alter table manager_month_reports disable row level security;

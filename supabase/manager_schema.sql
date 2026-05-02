-- Run in Supabase SQL Editor

create table if not exists manager_settings (
  key text primary key,
  value numeric(15,2) not null default 0
);
insert into manager_settings (key, value) values ('principal', 0), ('invest_start', 0)
on conflict (key) do nothing;

create table if not exists manager_transactions (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('in', 'out')),
  amount numeric(15,2) not null default 0,
  statement text,
  date date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists manager_months (
  id uuid primary key default uuid_generate_v4(),
  year_month text not null unique,
  investment_start numeric(15,2) not null default 0,
  profits numeric(15,2) not null default 0,
  created_at timestamptz default now()
);

create table if not exists manager_month_transactions (
  id uuid primary key default uuid_generate_v4(),
  month_id uuid not null references manager_months(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  amount numeric(15,2) not null default 0,
  statement text,
  date date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists manager_month_daily (
  id uuid primary key default uuid_generate_v4(),
  month_id uuid not null references manager_months(id) on delete cascade,
  daily_profit numeric(15,2) not null default 0,
  balance numeric(15,2) not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

alter table manager_settings disable row level security;
alter table manager_transactions disable row level security;
alter table manager_months disable row level security;
alter table manager_month_transactions disable row level security;
alter table manager_month_daily disable row level security;

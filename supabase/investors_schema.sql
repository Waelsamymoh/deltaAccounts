-- Run this in Supabase SQL Editor

create table if not exists investor_profiles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  share_price numeric(15,2) not null default 1,
  notes text,
  created_at timestamptz default now()
);

create table if not exists investor_entries (
  id uuid primary key default uuid_generate_v4(),
  investor_id uuid not null references investor_profiles(id) on delete cascade,
  type text not null check (type in ('assets_in', 'assets_out', 'profit')),
  amount numeric(15,2) not null default 0,
  statement text,
  date date not null default current_date,
  created_at timestamptz default now()
);

alter table investor_profiles disable row level security;
alter table investor_entries disable row level security;

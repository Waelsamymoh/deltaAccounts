-- Run in Supabase SQL Editor

create table if not exists client_profiles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists client_transactions (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references client_profiles(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  amount numeric(15,2) not null default 0,
  statement text,
  date date not null default current_date,
  created_at timestamptz default now()
);

alter table client_profiles disable row level security;
alter table client_transactions disable row level security;
